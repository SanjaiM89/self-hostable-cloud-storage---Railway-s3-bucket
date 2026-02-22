import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward } from 'lucide-react';
import Loader from './Loader';

export default function VideoPlayer({ src, poster, fileName }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (src) {
      video.load();
      if (video.paused) {
        video.play().catch(err => {
          console.log("Autoplay blocked or failed:", err);
        });
      }
    }

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setProgress((video.currentTime / video.duration) * 100);
    };
    const handleDurationChange = () => setDuration(video.duration);
    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);
    const handleProgress = () => {
      if (video.duration > 0 && video.buffered.length > 0) {
        const lastBuffered = video.buffered.end(video.buffered.length - 1);
        setBuffered((lastBuffered / video.duration) * 100);
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('canplay', () => setIsLoading(false));

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('progress', handleProgress);
    };
  }, [src]);

  const togglePlay = () => {
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  };

  const handleSeek = (e) => {
    const seekTime = (e.target.value / 100) * videoRef.current.duration;
    videoRef.current.currentTime = seekTime;
    setProgress(e.target.value);
  };

  const toggleMute = () => {
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    videoRef.current.volume = val;
    setIsMuted(val === 0);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div 
      ref={containerRef}
      className="relative group w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-[var(--border-color)]"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Percentage Indicator (Top Right) */}
      <div className="absolute top-4 right-4 z-30 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2 transition-all hover:bg-black/80">
        <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
        <span className="text-white text-xs font-semibold tracking-wide uppercase">
          {Math.round(buffered)}% Processed
        </span>
      </div>

      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full h-full cursor-pointer object-contain"
        onClick={togglePlay}
        playsInline
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[4px] z-20 transition-all duration-500">
          <Loader className="scale-125 mb-6" />
          <div className="flex flex-col items-center gap-1">
            <p className="text-white text-sm font-bold tracking-widest uppercase animate-pulse">
              Buffering
            </p>
            <p className="text-[var(--accent)] text-xs font-mono">
              {Math.round(buffered)}%
            </p>
          </div>
        </div>
      )}

      {/* Custom Controls */}
      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-6 pt-16 transition-all duration-500 ease-out ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        
        {/* Progress Bar */}
        <div className="relative w-full h-1.5 mb-6 group/progress cursor-pointer">
          <div className="absolute inset-0 bg-white/10 rounded-full" />
          <div 
            className="absolute inset-y-0 left-0 bg-white/20 rounded-full transition-all duration-500"
            style={{ width: `${buffered}%` }}
          />
          <div 
            className="absolute inset-y-0 left-0 bg-[var(--accent)] rounded-full shadow-[0_0_12px_rgba(52,211,153,0.5)]"
            style={{ width: `${progress}%` }}
          />
          <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={handleSeek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div 
            className="absolute h-4 w-4 bg-white rounded-full border-2 border-[var(--accent)] top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover/progress:opacity-100 transition-opacity"
            style={{ left: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button 
              onClick={togglePlay} 
              className="text-white hover:text-[var(--accent)] transition-all hover:scale-110 active:scale-95"
            >
              {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
            </button>
            
            <div className="flex items-center gap-3 group/volume">
              <button 
                onClick={toggleMute} 
                className="text-white hover:text-[var(--accent)] transition-colors"
              >
                {isMuted || volume === 0 ? <VolumeX size={22} /> : <Volume2 size={22} />}
              </button>
              <div className="relative w-0 group-hover/volume:w-24 overflow-hidden transition-all duration-500 h-6 flex items-center">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-24 h-1 accent-[var(--accent)] cursor-pointer"
                />
              </div>
            </div>

            <div className="text-white/90 text-sm font-mono tracking-tighter">
              <span className="font-bold">{formatTime(currentTime)}</span>
              <span className="mx-1.5 text-white/30">/</span>
              <span className="text-white/50">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <span className="text-white/30 text-[10px] font-medium tracking-widest uppercase truncate max-w-[180px] hidden lg:block border border-white/10 px-2 py-1 rounded">
              {fileName}
            </span>
            <button 
              onClick={toggleFullscreen} 
              className="text-white hover:text-[var(--accent)] transition-all hover:scale-110"
            >
              {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
