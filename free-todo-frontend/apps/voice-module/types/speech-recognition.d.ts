// Web Speech API 类型定义
interface SpeechRecognition extends EventTarget {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	maxAlternatives: number;
	serviceURI: string;
	start(): void;
	stop(): void;
	abort(): void;
	onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
	onend: ((this: SpeechRecognition, ev: Event) => any) | null;
	onerror:
		| ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any)
		| null;
	onresult:
		| ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any)
		| null;
	onnomatch:
		| ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any)
		| null;
	onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
	onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
	onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
	onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
	onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
	onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
}

interface SpeechRecognitionEvent extends Event {
	readonly resultIndex: number;
	readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
	readonly error: string;
	readonly message: string;
}

interface SpeechRecognitionResultList {
	readonly length: number;
	item(index: number): SpeechRecognitionResult;
	[index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
	readonly isFinal: boolean;
	readonly length: number;
	item(index: number): SpeechRecognitionAlternative;
	[index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
	readonly transcript: string;
	readonly confidence: number;
}

declare var SpeechRecognition: {
	prototype: SpeechRecognition;
	new (): SpeechRecognition;
};

declare var webkitSpeechRecognition: {
	prototype: SpeechRecognition;
	new (): SpeechRecognition;
};

interface Window {
	SpeechRecognition: typeof SpeechRecognition;
	webkitSpeechRecognition: typeof webkitSpeechRecognition;
}
