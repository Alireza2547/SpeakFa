const enabledToggle = document.getElementById('enabled');
const sentencesToggle = document.getElementById('sentences');
const langSelect = document.getElementById('lang');

chrome.storage.sync.get({ enabled: true, sentences: true, lang: 'auto' }, data => {
  enabledToggle.checked = data.enabled;
  sentencesToggle.checked = data.sentences;
  langSelect.value = data.lang;
});

enabledToggle.addEventListener('change', () => chrome.storage.sync.set({ enabled: enabledToggle.checked }));
sentencesToggle.addEventListener('change', () => chrome.storage.sync.set({ sentences: sentencesToggle.checked }));
langSelect.addEventListener('change', () => chrome.storage.sync.set({ lang: langSelect.value }));

document.getElementById('help').addEventListener('click', () => {
  const help = document.getElementById('helpText');
  help.hidden = !help.hidden;
});