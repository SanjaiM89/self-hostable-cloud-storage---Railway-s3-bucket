import { filesAPI } from './api';

/**
 * Handles uploading a folder with nested structure.
 * @param {FileList} fileList - The list of files from input[type="file"]
 * @param {string|number|null} rootFolderId - The ID of the current folder to upload into
 * @param {function} onProgress - Callback (current, total, status)
 */
export async function uploadFolder(fileList, rootFolderId, onProgress) {
    const files = Array.from(fileList);
    const totalFiles = files.length;

    // 1. Identify all unique folder paths
    // webkitRelativePath example: "MyFolder/Sub/file.txt"
    // We want to create "MyFolder", "MyFolder/Sub"
    const folderPaths = new Set();
    const fileMap = []; // { file, folderPath }

    files.forEach(file => {
        const pathParts = file.webkitRelativePath.split('/');
        // The last part is filename, removing it gives folder path parts
        pathParts.pop();

        if (pathParts.length > 0) {
            // Add all intermediate paths
            // e.g. ['A', 'B'] -> add "A", add "A/B"
            let currentPath = '';
            pathParts.forEach(part => {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                folderPaths.add(currentPath);
            });
        }

        const folderPath = pathParts.join('/');
        fileMap.push({ file, folderPath });
    });

    // 2. Sort folder paths by depth (number of slashes)
    // This ensures we create parents before children
    const sortedPaths = Array.from(folderPaths).sort((a, b) => {
        return a.split('/').length - b.split('/').length;
    });

    // 3. Create folders sequentially
    // Map: "path/to/folder" -> database_id
    const folderIdMap = new Map();
    folderIdMap.set('', rootFolderId); // Root mapped to empty path

    let foldersCreated = 0;
    const totalFolders = sortedPaths.length;

    if (onProgress) onProgress(0, totalFiles, `Creating ${totalFolders} folders...`);

    for (const path of sortedPaths) {
        const parts = path.split('/');
        const folderName = parts.pop();
        const parentPath = parts.join('/');

        const parentId = folderIdMap.get(parentPath);

        try {
            // Check if folder exists? API doesn't support check-then-create efficiently yet.
            // We just create. If name exists, backend creates duplicate or handles it.
            // Backend `create_folder` usually allows duplicates or renaming.
            // Ideally we should check, but for now we create.
            const res = await filesAPI.createFolder(folderName, parentId);
            folderIdMap.set(path, res.data.id);
            foldersCreated++;
            if (onProgress) onProgress(0, totalFiles, `Created folder ${foldersCreated}/${totalFolders}`);
        } catch (err) {
            console.error(`Failed to create folder ${path}`, err);
            // If failed, we skip uploading files to this folder
        }
    }

    // 4. Upload files
    // Use a concurrency limit (e.g. 3) to avoid overwhelming network
    const CONCURRENCY = 3;
    let activeUploads = 0;
    let uploadedCount = 0;

    const uploadFile = async (fileItem) => {
        const { file, folderPath } = fileItem;
        const parentId = folderIdMap.get(folderPath);

        if (parentId === undefined) {
            console.warn(`Skipping file ${file.name} because parent folder creation failed.`);
            return;
        }

        try {
            // Using standard upload
            const formData = new FormData();
            formData.append('file', file);
            if (parentId) formData.append('parent_id', parentId);

            await filesAPI.upload(formData, (progressEvent) => {
                // We could track per-file progress here if needed
            });

            uploadedCount++;
            if (onProgress) onProgress(uploadedCount, totalFiles, `Uploaded ${uploadedCount}/${totalFiles}`);

        } catch (err) {
            console.error(`Failed to upload ${file.name}`, err);
        }
    };

    // Queue execution
    const queue = [...fileMap];
    const runQueue = async () => {
        const promises = [];
        while (queue.length > 0 || promises.length > 0) {
            while (queue.length > 0 && promises.length < CONCURRENCY) {
                const item = queue.shift();
                const p = uploadFile(item).then(() => {
                    promises.splice(promises.indexOf(p), 1);
                });
                promises.push(p);
            }
            if (promises.length > 0) {
                await Promise.race(promises);
            } else {
                break;
            }
        }
    };

    await runQueue();

    if (onProgress) onProgress(totalFiles, totalFiles, 'Upload complete!');
}
