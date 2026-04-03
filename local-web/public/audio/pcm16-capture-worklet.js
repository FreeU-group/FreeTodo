class Pcm16CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const providedChunk = options?.processorOptions?.chunkSamples;
    const chunkSamples = Number.isFinite(providedChunk) ? Number(providedChunk) : 1024;

    this.chunkSamples = Math.max(256, chunkSamples);
    this.floatBuffer = new Float32Array(this.chunkSamples * 2);
    this.floatWriteIndex = 0;
    this.droppedFrames = 0;
    this.framesSinceLastTelemetry = 0;
  }

  process(inputs) {
    const input = inputs?.[0]?.[0];
    if (!input || input.length === 0) {
      return true;
    }

    this.append(input);
    this.flushChunks();
    this.maybeReportTelemetry();
    return true;
  }

  append(input) {
    for (let i = 0; i < input.length; i++) {
      if (this.floatWriteIndex >= this.floatBuffer.length) {
        this.growBuffer();
      }
      this.floatBuffer[this.floatWriteIndex++] = input[i];
    }
  }

  flushChunks() {
    while (this.floatWriteIndex >= this.chunkSamples) {
      const pcm16 = new Int16Array(this.chunkSamples);
      for (let i = 0; i < this.chunkSamples; i++) {
        const sample = Math.max(-1, Math.min(1, this.floatBuffer[i]));
        pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      this.port.postMessage(
        {
          type: "pcm16",
          payload: pcm16.buffer,
        },
        [pcm16.buffer],
      );

      this.floatBuffer.copyWithin(0, this.chunkSamples, this.floatWriteIndex);
      this.floatWriteIndex -= this.chunkSamples;
      this.framesSinceLastTelemetry += this.chunkSamples;
    }
  }

  growBuffer() {
    const next = new Float32Array(this.floatBuffer.length * 2);
    next.set(this.floatBuffer.subarray(0, this.floatWriteIndex));
    this.floatBuffer = next;
    this.droppedFrames += 1;
  }

  maybeReportTelemetry() {
    if (this.framesSinceLastTelemetry < sampleRate * 2) {
      return;
    }

    this.port.postMessage({
      type: "telemetry",
      droppedFrames: this.droppedFrames,
      pendingFrames: this.floatWriteIndex,
    });
    this.framesSinceLastTelemetry = 0;
  }
}

registerProcessor("pcm16-capture", Pcm16CaptureProcessor);
