const meSpeak = require('mespeak');
meSpeak.loadConfig(require('mespeak/src/mespeak_config.json'));

const VOICES = {
  'en-US': require('mespeak/voices/en/en-us.json'),
  'en-GB': require('mespeak/voices/en/en-rp.json'),
  'fr-FR': require('mespeak/voices/fr.json')
};
const loaded = new Set();

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'OFFSCREEN_STOP') {
    meSpeak.stop();
    return;
  }
  if (message?.type !== 'OFFSCREEN_SPEAK') return;
  const key = VOICES[message.lang] ? message.lang : 'en-US';
  const voice = VOICES[key];
  if (!loaded.has(key)) {
    meSpeak.loadVoice(voice);
    loaded.add(key);
  }
  meSpeak.stop();
  meSpeak.speak(message.text, { voice: voice.voice_id, speed: Math.round(175 * (message.rate || 1)) });
});
