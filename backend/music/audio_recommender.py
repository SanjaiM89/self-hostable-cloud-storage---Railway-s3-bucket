import os
import asyncio
from typing import List, Dict, Tuple
import logging
import json

logger = logging.getLogger("AudioRecommender")

try:
    import numpy as np
    import faiss
    import essentia.standard as es
    DEPENDENCIES_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Audio Recommendation dependencies missing: {e}. Feature disabled.")
    DEPENDENCIES_AVAILABLE = False
    
# Path to store the FAISS index and ID map
DATA_DIR = os.path.join(os.path.dirname(__file__), "../../data")
os.makedirs(DATA_DIR, exist_ok=True)
INDEX_PATH = os.path.join(DATA_DIR, "audio_features.index")
MAP_PATH = os.path.join(DATA_DIR, "id_to_vector.json")

class AudioRecommender:
    def __init__(self):
        self.index = None
        self.map_id_to_vector = {} # In-memory map for quick lookups
        self.map_index_to_song_id = {} # Map faiss index ID to song ID
        self.dimension = 0
        if not DEPENDENCIES_AVAILABLE:
            logger.warning("AudioRecommender initialized but dependencies are missing.")
        else:
            self.load_index()
        
    def _extract_features(self, file_path: str) -> List[float]:
        if not DEPENDENCIES_AVAILABLE:
            return None
            
        """
        Extracts audio features using Essentia.
        Returns a normalized vector.
        """
        try:
            # Load audio (downsample to 22k for speed, mono)
            # Ensure file exists
            if not os.path.exists(file_path):
                logger.error(f"File not found: {file_path}")
                return None

            loader = es.MonoLoader(filename=file_path, sampleRate=22050)
            audio = loader()
            
            # 1. Rhythm / Tempo
            rhythm_extractor = es.RhythmExtractor2013(method="multifeature")
            bpm, _, _, _, _ = rhythm_extractor(audio)
            
            # 2. Energy / Intensity (RMS)
            rms = es.RMS()(audio)
            energy = np.mean(rms)
            
            # 3. Danceability
            danceability, _ = es.Danceability()(audio)
            
            # 4. Spectral Features (MFCCs)
            w = es.Windowing(type = 'hann')
            spectrum = es.Spectrum()
            mfcc = es.MFCC()
            
            mfccs = []
            # Analyze first 30 seconds only for speed/consistency
            limit_samples = min(len(audio), 22050 * 30)
            for frame in es.FrameGenerator(audio[:limit_samples], frameSize=1024, hopSize=512, startFromZero=True):
                mfcc_bands, mfcc_coeffs = mfcc(spectrum(w(frame)))
                mfccs.append(mfcc_coeffs)
            
            avg_mfcc = np.mean(mfccs, axis=0)
            
            # Construct final vector
            features = np.array([
                bpm / 200.0,       # Normalize BPM roughly 0-1
                danceability,      # Already 0-1
                min(energy * 10, 1.0) # Boost and clip energy
            ], dtype=np.float32)
            
            # Concatenate MFCCs (normalize them too slightly)
            features = np.concatenate((features, avg_mfcc / 100.0))
            
            return features.astype('float32') # Return as numpy array internally
            
        except Exception as e:
            logger.error(f"[AudioRecommender] Extraction error for {file_path}: {e}")
            return None

    def initialize_index(self, dimension: int):
        """Initialize a new FAISS index"""
        if not DEPENDENCIES_AVAILABLE:
            return
            
        self.dimension = dimension
        self.index = faiss.IndexFlatL2(dimension) # L2 distance (Euclidean)
        self.map_index_to_song_id = {}

    def add_to_index(self, song_id: int, vector: List[float]):
        """Add a song vector to the index"""
        if not DEPENDENCIES_AVAILABLE or not vector:
            return
            
        np_vector = np.array([vector], dtype='float32')

        if self.index is None:
            self.initialize_index(np_vector.shape[1])
            
        # Add to FAISS
        self.index.add(np_vector)
        
        # Track mapping
        internal_id = self.index.ntotal - 1
        self.map_index_to_song_id[internal_id] = song_id
        self.map_id_to_vector[str(song_id)] = vector
        
        # Save after adding
        self.save_index()

    def find_similar(self, song_id: int, limit: int = 5) -> List[int]:
        """Find similar songs by ID"""
        if not DEPENDENCIES_AVAILABLE or self.index is None or str(song_id) not in self.map_id_to_vector:
            return []
            
        query_vector = np.array([self.map_id_to_vector[str(song_id)]], dtype='float32')
        
        # Search
        distances, indices = self.index.search(query_vector, limit + 1)
        
        similar_ids = []
        for idx in indices[0]:
            if idx != -1:
                found_id = self.map_index_to_song_id.get(idx)
                if found_id and found_id != song_id:
                    similar_ids.append(found_id)
                    
        return similar_ids[:limit]
        
    async def process_song(self, song_path: str) -> List[float]:
        """Async wrapper for feature extraction"""
        if not DEPENDENCIES_AVAILABLE or not os.path.exists(song_path):
            return None
            
        loop = asyncio.get_running_loop()
        vector = await loop.run_in_executor(None, self._extract_features, song_path)
        
        if vector is not None:
             return vector.tolist()
        return None

    def save_index(self):
        """Save FAISS index and mapping to disk"""
        if not DEPENDENCIES_AVAILABLE or self.index is None:
            return
            
        try:
            faiss.write_index(self.index, INDEX_PATH)
            
            # Convert int keys to str for JSON
            serializable_map = {str(k): v for k, v in self.map_index_to_song_id.items()}
            
            data = {
                "map_index_to_song_id": serializable_map,
                "map_id_to_vector": self.map_id_to_vector
            }
            with open(MAP_PATH, 'w') as f:
                json.dump(data, f)
            logger.info("Saved audio index to disk.")
        except Exception as e:
            logger.error(f"Failed to save index: {e}")

    def load_index(self):
        """Load FAISS index and mapping from disk"""
        if not DEPENDENCIES_AVAILABLE:
            return
            
        if os.path.exists(INDEX_PATH) and os.path.exists(MAP_PATH):
            try:
                self.index = faiss.read_index(INDEX_PATH)
                with open(MAP_PATH, 'r') as f:
                    data = json.load(f)
                    # Convert keys back to int for internal map
                    self.map_index_to_song_id = {int(k): v for k, v in data["map_index_to_song_id"].items()}
                    self.map_id_to_vector = data["map_id_to_vector"]
                logger.info("Loaded audio index from disk.")
            except Exception as e:
                logger.error(f"Failed to load index: {e}")

# Singleton instance
audio_recommender = AudioRecommender()
