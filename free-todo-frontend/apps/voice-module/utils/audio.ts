// Utility to convert Float32Array to 16-bit PCM for Gemini
export const floatTo16BitPCM = (input: Float32Array): Int16Array => {
	const output = new Int16Array(input.length);
	for (let i = 0; i < input.length; i++) {
		const s = Math.max(-1, Math.min(1, input[i]));
		output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
	}
	return output;
};

// Simple base64 encoder for ArrayBuffer
export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
	let binary = "";
	const bytes = new Uint8Array(buffer);
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
};
