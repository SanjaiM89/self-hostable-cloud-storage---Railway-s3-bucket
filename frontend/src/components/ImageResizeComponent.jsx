import { NodeViewWrapper } from '@tiptap/react';
import React, { useRef, useState, useEffect } from 'react';

export default function ImageResizeComponent(props) {
    const { node, updateAttributes, selected } = props;
    const [width, setWidth] = useState(node.attrs.width || '100%');
    const imageRef = useRef(null);
    const resizingRef = useRef(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    useEffect(() => {
        setWidth(node.attrs.width || '100%');
    }, [node.attrs.width]);

    const handleMouseDown = (e, direction) => {
        e.preventDefault();
        e.stopPropagation();
        resizingRef.current = true;
        startXRef.current = e.clientX;

        // Get current pixel width
        const currentWidth = imageRef.current ? imageRef.current.offsetWidth : 0;
        startWidthRef.current = currentWidth;

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e) => {
        if (!resizingRef.current) return;
        const deltaX = e.clientX - startXRef.current;
        // Logic for right handle. For left handle, subtract deltaX.
        // Simplified: only allow right-side resizing for now to keep it robust.
        const newWidth = Math.max(50, startWidthRef.current + deltaX);

        setWidth(`${newWidth}px`);
    };

    const handleMouseUp = () => {
        resizingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        // Save the final width to node attributes
        // We save as string '300px'
        updateAttributes({ width: width }); // uses the state width which is updated in mousemove
    };

    return (
        <NodeViewWrapper className="image-resizer" style={{
            display: 'flex',
            justifyContent: 'center', // Center image by default
            margin: '1.5rem 0',
            position: 'relative'
        }}>
            <div
                style={{
                    position: 'relative',
                    display: 'inline-block',
                    maxWidth: '100%',
                    // Show outline when selected
                    outline: selected ? '2px solid var(--accent)' : 'none',
                    borderRadius: '8px',
                }}
            >
                <img
                    ref={imageRef}
                    src={node.attrs.src}
                    alt={node.attrs.alt}
                    style={{
                        width: width,
                        maxWidth: '100%',
                        height: 'auto',
                        borderRadius: '8px',
                        display: 'block',
                    }}
                />

                {selected && (
                    <>
                        {/* Right Resize Handle */}
                        <div
                            onMouseDown={(e) => handleMouseDown(e, 'right')}
                            style={{
                                position: 'absolute',
                                right: '-6px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: '12px',
                                height: '24px',
                                background: 'var(--accent)',
                                borderRadius: '4px',
                                cursor: 'ew-resize',
                                zIndex: 10,
                                border: '2px solid white',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}
                        />
                        {/* Bottom Right Resize Handle */}
                        <div
                            onMouseDown={(e) => handleMouseDown(e, 'right')}
                            style={{
                                position: 'absolute',
                                right: '-6px',
                                bottom: '-6px',
                                width: '12px',
                                height: '12px',
                                background: 'var(--accent)',
                                borderRadius: '50%',
                                cursor: 'nwse-resize',
                                zIndex: 10,
                                border: '2px solid white',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}
                        />
                    </>
                )}
            </div>
        </NodeViewWrapper>
    );
}
