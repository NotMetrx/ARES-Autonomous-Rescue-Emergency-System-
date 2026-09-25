import { tacticalAudio } from './tacticalAudio';

class TacticalVoiceService {
  private enabled: boolean = true;
  private lastSpokenTime: Record<string, number> = {};
  private cooldownMs: number = 3500; // avoid repeating the exact same alert within 3.5s

  public setEnabled(val: boolean) {
    this.enabled = val;
    tacticalAudio.setEnabled(val);
    if (!val && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public speak(text: string, category: string = 'general', force: boolean = false) {
    if (!this.enabled || !('speechSynthesis' in window)) return;

    const now = Date.now();
    if (!force && this.lastSpokenTime[category] && (now - this.lastSpokenTime[category] < this.cooldownMs)) {
      return;
    }
    this.lastSpokenTime[category] = now;

    // Play procedural military radio chirp or collision alarm
    if (category === 'collision') {
      tacticalAudio.playCollisionAlarm();
    } else {
      tacticalAudio.playRadioChirp();
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 1.05;
      utterance.pitch = 0.95; // deeper tactical pitch

      const voices = window.speechSynthesis.getVoices();
      const esVoice = voices.find(v => v.lang.startsWith('es'));
      if (esVoice) utterance.voice = esVoice;

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Tactical voice error:', e);
    }
  }
}

export const tacticalVoice = new TacticalVoiceService();
