"use client";

import { useCallback, useRef, useState } from "react";

export function useAudioPlayback() {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [playbackRate, setPlaybackRate] = useState(1.0);

	const ensureAudio = useCallback((url: string) => {
		if (!audioRef.current) {
			const audio = new Audio(url);
			audio.addEventListener("loadedmetadata", () => {
				setDuration(audio.duration);
			});
			audio.addEventListener("timeupdate", () => {
				setCurrentTime(audio.currentTime);
			});
			audio.addEventListener("ended", () => {
				setIsPlaying(false);
				setCurrentTime(0);
			});
			audio.addEventListener("play", () => setIsPlaying(true));
			audio.addEventListener("pause", () => setIsPlaying(false));
			audio.playbackRate = playbackRate; // 设置初始倍速
			audioRef.current = audio;
		} else if (audioRef.current.src !== url) {
			audioRef.current.src = url;
			audioRef.current.load();
			audioRef.current.playbackRate = playbackRate; // 设置倍速
		} else {
			// 确保倍速设置正确
			audioRef.current.playbackRate = playbackRate;
		}
	}, [playbackRate]);

	const playPause = useCallback((url?: string) => {
		if (url) {
			ensureAudio(url);
		}
		const audio = audioRef.current;
		if (!audio) return;

		if (audio.paused) {
			audio.play().catch((e) => console.error("Failed to play audio:", e));
		} else {
			audio.pause();
		}
	}, [ensureAudio]);

	const seek = useCallback((targetTime: number) => {
		const audio = audioRef.current;
		if (!audio) return;
		try {
			audio.currentTime = Math.max(0, targetTime);
			setCurrentTime(audio.currentTime);
		} catch (e) {
			console.error("Failed to seek audio:", e);
		}
	}, []);

	const seekByRatio = useCallback((ratio: number) => {
		const audio = audioRef.current;
		if (!audio) return;
		const target = Math.max(0, Math.min(1, ratio)) * (audio.duration || 0);
		seek(target);
	}, [seek]);

	const setPlaybackRateValue = useCallback((rate: number) => {
		setPlaybackRate(rate);
		if (audioRef.current) {
			audioRef.current.playbackRate = rate;
		}
	}, []);

	return {
		audioRef,
		isPlaying,
		currentTime,
		duration,
		playbackRate,
		ensureAudio,
		playPause,
		seek,
		seekByRatio,
		setPlaybackRate: setPlaybackRateValue,
	};
}
