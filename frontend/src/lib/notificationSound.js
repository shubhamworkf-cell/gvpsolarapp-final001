// Web Audio API Notification Sound & Vibration Synthesizer
export function playNotificationSound() {
  try {
    if (typeof window === "undefined") return;

    // Mobile vibration if supported
    if ("vibrate" in navigator) {
      try {
        navigator.vibrate([100, 50, 100]);
      } catch (_) {}
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Dual-tone chime: 659Hz (E5) -> 880Hz (A5)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";

    osc1.frequency.setValueAtTime(659.25, now); // E5
    osc2.frequency.setValueAtTime(880.0, now + 0.12); // A5

    // Smooth envelope: 350ms duration total
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.15);

    osc2.start(now + 0.12);
    osc2.stop(now + 0.35);

    // Clean up AudioContext after sound completes
    setTimeout(() => {
      try {
        ctx.close();
      } catch (_) {}
    }, 450);
  } catch (err) {
    console.warn("Notification sound playback bypassed:", err);
  }
}
