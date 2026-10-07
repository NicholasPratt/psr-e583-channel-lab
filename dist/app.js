(() => {
  "use strict";

  const voices = window.PSR_E583_VOICES || [];
  const CONTROLS = [
    { key: "volume", label: "Volume", cc: 7, initial: 100 },
    { key: "expression", label: "Expression", cc: 11, initial: 127 },
    { key: "pan", label: "Pan", cc: 10, initial: 64, display: panLabel },
    { key: "reverb", label: "Reverb send", cc: 91, initial: 40 },
    { key: "chorus", label: "Chorus send", cc: 93, initial: 0 },
  ];
  const FAMILY_RANGES = [
    [1, 50, "Piano & keys"], [51, 89, "Organ"], [90, 141, "Guitar & bass"],
    [142, 178, "Strings & choir"], [179, 208, "Brass"], [209, 238, "Woodwind"],
    [239, 280, "World"], [281, 339, "Synth"], [340, 392, "Percussion & drums"],
    [393, 438, "Arpeggio"], [439, 890, "XGlite"],
  ];
  const defaultVoice = voices.find((voice) => voice.no === 1) || voices[0];
  const defaultDrums = voices.find((voice) => voice.no === 359) || defaultVoice;
  const state = {
    midiAccess: null,
    output: null,
    activeVoiceChannel: 0,
    channels: Array.from({ length: 16 }, (_, index) => makeChannel(index === 9 ? defaultDrums : defaultVoice)),
  };
  const elements = {
    grid: document.querySelector("#channelGrid"),
    template: document.querySelector("#channelTemplate"),
    connect: document.querySelector("#connectButton"),
    output: document.querySelector("#outputSelect"),
    midiStatus: document.querySelector("#midiStatus"),
    statusDot: document.querySelector("#statusDot"),
    activity: document.querySelector("#activity"),
    setupName: document.querySelector("#setupName"),
    voiceDialog: document.querySelector("#voiceDialog"),
    voiceDialogChannel: document.querySelector("#voiceDialogChannel"),
    voiceSearch: document.querySelector("#voiceSearch"),
    voiceFamily: document.querySelector("#voiceFamily"),
    voiceResults: document.querySelector("#voiceResults"),
    voiceResultCount: document.querySelector("#voiceResultCount"),
    setupDialog: document.querySelector("#setupDialog"),
    setupList: document.querySelector("#setupList"),
    setupCount: document.querySelector("#setupCount"),
    toast: document.querySelector("#toast"),
    importFile: document.querySelector("#importFile"),
  };

  function makeChannel(voice) {
    return { voice: { ...voice }, volume: 100, expression: 127, pan: 64, reverb: 40, chorus: 0, muted: false };
  }

  function familyFor(no) {
    return FAMILY_RANGES.find(([min, max]) => no >= min && no <= max)?.[2] || "Other";
  }

  function panLabel(value) {
    if (value === 64) return "C";
    return value < 64 ? `L${64 - value}` : `R${value - 64}`;
  }

  function rangeFill(input) {
    input.style.setProperty("--fill", `${(Number(input.value) / 127) * 100}%`);
  }

  function clampMidi(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(127, Math.round(number))) : fallback;
  }

  function send(bytes) {
    if (!state.output) return false;
    state.output.send(bytes);
    return true;
  }

  function sendCC(channelIndex, cc, value) {
    return send([0xB0 + channelIndex, cc, clampMidi(value)]);
  }

  function sendVoice(channelIndex) {
    const voice = state.channels[channelIndex].voice;
    sendCC(channelIndex, 0, voice.msb);
    sendCC(channelIndex, 32, voice.lsb);
    send([0xC0 + channelIndex, clampMidi(voice.program - 1)]);
  }

  function sendChannel(channelIndex) {
    const channel = state.channels[channelIndex];
    sendVoice(channelIndex);
    CONTROLS.forEach((control) => sendCC(channelIndex, control.cc, channel.muted && control.key === "volume" ? 0 : channel[control.key]));
    activity(`Sent channel ${channelIndex + 1}: ${channel.voice.name}`);
  }

  function renderChannels() {
    elements.grid.replaceChildren();
    state.channels.forEach((channel, channelIndex) => {
      const card = elements.template.content.firstElementChild.cloneNode(true);
      card.dataset.channel = channelIndex;
      card.classList.toggle("muted", channel.muted);
      card.querySelector(".channel-number").textContent = String(channelIndex + 1).padStart(2, "0");
      card.querySelector(".channel-role").textContent = channelIndex === 9 ? "DRUM PART" : "MIDI PART";
      const mute = card.querySelector(".mute-button");
      mute.setAttribute("aria-pressed", String(channel.muted));
      mute.addEventListener("click", () => toggleMute(channelIndex));
      updatePatchCard(card, channel);
      card.querySelector(".patch-button").addEventListener("click", () => openVoiceDialog(channelIndex));

      const stack = card.querySelector(".control-stack");
      CONTROLS.forEach((control) => {
        const row = document.createElement("div");
        row.className = "control-row";
        const id = `ch-${channelIndex + 1}-${control.key}`;
        row.innerHTML = `<label for="${id}">${control.label}</label><input id="${id}" type="range" min="0" max="127" value="${channel[control.key]}"><span class="control-value"></span>`;
        const input = row.querySelector("input");
        const output = row.querySelector("span");
        const sync = () => {
          channel[control.key] = Number(input.value);
          output.textContent = control.display ? control.display(channel[control.key]) : channel[control.key];
          rangeFill(input);
        };
        sync();
        input.addEventListener("input", () => { sync(); sendCC(channelIndex, control.cc, channel[control.key]); });
        stack.append(row);
      });

      const fields = [
        [".msb-input", "msb", 0, 127], [".lsb-input", "lsb", 0, 127], [".program-input", "program", 1, 128],
      ];
      fields.forEach(([selector, key, min, max]) => {
        const input = card.querySelector(selector);
        input.value = channel.voice[key];
        input.addEventListener("change", () => {
          channel.voice = { ...channel.voice, no: null, name: "Custom voice", [key]: Math.max(min, Math.min(max, Number(input.value) || min)) };
          updatePatchCard(card, channel);
          sendVoice(channelIndex);
        });
      });
      card.querySelector(".test-button").addEventListener("click", () => testNote(channelIndex));
      card.querySelector(".send-button").addEventListener("click", () => sendChannel(channelIndex));
      elements.grid.append(card);
    });
  }

  function updatePatchCard(card, channel) {
    card.querySelector(".patch-name").textContent = channel.voice.name;
    card.querySelector(".patch-meta").textContent = `MSB ${channel.voice.msb}  ·  LSB ${channel.voice.lsb}  ·  PC ${channel.voice.program}`;
    card.querySelector(".msb-input").value = channel.voice.msb;
    card.querySelector(".lsb-input").value = channel.voice.lsb;
    card.querySelector(".program-input").value = channel.voice.program;
  }

  function toggleMute(channelIndex) {
    const channel = state.channels[channelIndex];
    channel.muted = !channel.muted;
    sendCC(channelIndex, 7, channel.muted ? 0 : channel.volume);
    const card = elements.grid.querySelector(`[data-channel="${channelIndex}"]`);
    card.classList.toggle("muted", channel.muted);
    card.querySelector(".mute-button").setAttribute("aria-pressed", String(channel.muted));
    activity(`Channel ${channelIndex + 1} ${channel.muted ? "muted" : "unmuted"}`);
  }

  function testNote(channelIndex) {
    if (!state.output) return toast("Connect a MIDI output first.");
    const note = channelIndex === 9 ? 36 : 60;
    send([0x90 + channelIndex, note, 96]);
    window.setTimeout(() => send([0x80 + channelIndex, note, 0]), 420);
    activity(`Test note sent on channel ${channelIndex + 1}`);
  }

  async function connectMidi() {
    if (!navigator.requestMIDIAccess) {
      toast("Web MIDI is not available in this browser. Try Chrome or Edge on desktop.");
      return;
    }
    try {
      state.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      state.midiAccess.onstatechange = refreshOutputs;
      refreshOutputs();
      elements.output.disabled = false;
      elements.connect.textContent = "Refresh MIDI";
      activity("MIDI access granted — choose the Yamaha output.");
    } catch (error) {
      toast("MIDI permission was not granted.");
      activity("MIDI connection cancelled.");
    }
  }

  function refreshOutputs() {
    const previous = state.output?.id || elements.output.value;
    const outputs = [...(state.midiAccess?.outputs.values() || [])];
    elements.output.replaceChildren(new Option(outputs.length ? "Select an output" : "No MIDI outputs found", ""));
    outputs.forEach((output) => elements.output.add(new Option(output.name || "MIDI output", output.id)));
    const selected = outputs.find((output) => output.id === previous) || (outputs.length === 1 ? outputs[0] : null);
    elements.output.value = selected?.id || "";
    chooseOutput();
  }

  function chooseOutput() {
    state.output = state.midiAccess ? [...state.midiAccess.outputs.values()].find((output) => output.id === elements.output.value) || null : null;
    elements.statusDot.classList.toggle("online", Boolean(state.output));
    elements.midiStatus.textContent = state.output ? state.output.name : "MIDI not connected";
    if (state.output) activity(`Connected to ${state.output.name}`);
  }

  function openVoiceDialog(channelIndex) {
    state.activeVoiceChannel = channelIndex;
    elements.voiceDialogChannel.textContent = `CHANNEL ${channelIndex + 1}`;
    elements.voiceSearch.value = "";
    elements.voiceFamily.value = "all";
    renderVoices();
    elements.voiceDialog.showModal();
    window.setTimeout(() => elements.voiceSearch.focus(), 50);
  }

  function renderVoices() {
    const query = elements.voiceSearch.value.trim().toLowerCase();
    const family = elements.voiceFamily.value;
    const current = state.channels[state.activeVoiceChannel]?.voice;
    const matches = voices.filter((voice) => {
      const matchesText = !query || voice.name.toLowerCase().includes(query) || String(voice.no) === query || `${voice.msb}:${voice.lsb}:${voice.program}`.includes(query);
      return matchesText && (family === "all" || familyFor(voice.no) === family);
    });
    elements.voiceResults.replaceChildren();
    matches.slice(0, 180).forEach((voice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "voice-option";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(voice.msb === current.msb && voice.lsb === current.lsb && voice.program === current.program));
      button.innerHTML = `<span class="voice-title"><strong>${escapeHtml(voice.name)}</strong><small>No. ${voice.no} · ${familyFor(voice.no)}</small></span><code>${voice.msb}:${voice.lsb}</code><code>${voice.program}</code>`;
      button.addEventListener("click", () => selectVoice(voice));
      elements.voiceResults.append(button);
    });
    elements.voiceResultCount.textContent = matches.length > 180 ? `Showing 180 of ${matches.length}` : `${matches.length} voices`;
  }

  function selectVoice(voice) {
    const channelIndex = state.activeVoiceChannel;
    state.channels[channelIndex].voice = { ...voice };
    const card = elements.grid.querySelector(`[data-channel="${channelIndex}"]`);
    updatePatchCard(card, state.channels[channelIndex]);
    sendVoice(channelIndex);
    elements.voiceDialog.close();
    activity(`Channel ${channelIndex + 1}: ${voice.name}`);
  }

  function sendAll() {
    if (!state.output) return toast("Connect a MIDI output first.");
    state.channels.forEach((_, index) => sendChannel(index));
    toast("All 16 channels sent to the keyboard.");
  }

  function panic() {
    for (let channel = 0; channel < 16; channel += 1) {
      sendCC(channel, 64, 0);
      sendCC(channel, 120, 0);
      sendCC(channel, 123, 0);
    }
    activity("Panic sent: sustain off, all sound off, all notes off.");
    toast("Panic sent on all 16 channels.");
  }

  function setupData() {
    return { version: 1, device: "Yamaha PSR-E583", name: elements.setupName.value.trim() || "Untitled setup", savedAt: new Date().toISOString(), channels: state.channels };
  }

  function savedSetups() {
    try { return JSON.parse(localStorage.getItem("psr-e583-setups") || "[]"); } catch { return []; }
  }

  function saveSetup() {
    const setup = setupData();
    const setups = savedSetups();
    const existing = setups.findIndex((item) => item.name.toLowerCase() === setup.name.toLowerCase());
    if (existing >= 0) setups[existing] = setup; else setups.unshift(setup);
    localStorage.setItem("psr-e583-setups", JSON.stringify(setups.slice(0, 30)));
    updateSetupCount();
    toast(`Saved “${setup.name}” on this device.`);
  }

  function loadSetup(setup) {
    if (!setup?.channels || setup.channels.length !== 16) throw new Error("This file does not contain a 16-channel setup.");
    elements.setupName.value = setup.name || "Imported setup";
    state.channels = setup.channels.map((channel) => ({ ...makeChannel(defaultVoice), ...channel, voice: { ...channel.voice } }));
    renderChannels();
    elements.setupDialog.close();
    activity(`Loaded setup: ${elements.setupName.value}`);
  }

  function renderSetupLibrary() {
    const setups = savedSetups();
    elements.setupList.replaceChildren();
    if (!setups.length) {
      elements.setupList.innerHTML = '<p class="setup-empty">No saved setups yet. Name the current setup and press Save.</p>';
      return;
    }
    setups.forEach((setup, index) => {
      const item = document.createElement("div");
      item.className = "setup-item";
      const date = new Date(setup.savedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
      item.innerHTML = `<div><strong>${escapeHtml(setup.name)}</strong><small>${date}</small></div><button type="button">Load</button><button class="delete-setup" type="button">Delete</button>`;
      item.querySelector("button").addEventListener("click", () => loadSetup(setup));
      item.querySelector(".delete-setup").addEventListener("click", () => {
        const next = savedSetups(); next.splice(index, 1); localStorage.setItem("psr-e583-setups", JSON.stringify(next)); renderSetupLibrary(); updateSetupCount();
      });
      elements.setupList.append(item);
    });
  }

  function exportSetup() {
    const setup = setupData();
    const blob = new Blob([JSON.stringify(setup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${setup.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "psr-e583-setup"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importSetup(file) {
    try { loadSetup(JSON.parse(await file.text())); toast("Setup imported."); } catch (error) { toast(error.message || "That setup file could not be read."); }
    elements.importFile.value = "";
  }

  function updateSetupCount() { elements.setupCount.textContent = savedSetups().length; }
  function activity(message) { elements.activity.textContent = message; }
  let toastTimer;
  function toast(message) { elements.toast.textContent = message; elements.toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2800); }
  function escapeHtml(value) { const element = document.createElement("span"); element.textContent = value; return element.innerHTML; }

  function registerWebMcp() {
    if (!document.modelContext?.registerTool) return;
    const tools = [
      {
        name: "read_midi_setup", title: "Read MIDI setup", description: "Read the current 16-channel PSR-E583 setup shown in the editor.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => setupData(),
      },
      {
        name: "configure_midi_channel", title: "Configure MIDI channel", description: "Set the voice and MIDI controller values for one visible channel without transmitting it.",
        inputSchema: { type: "object", required: ["channel"], additionalProperties: false, properties: { channel: { type: "integer", minimum: 1, maximum: 16 }, voiceNumber: { type: "integer", minimum: 1, maximum: 890 }, volume: { type: "integer", minimum: 0, maximum: 127 }, expression: { type: "integer", minimum: 0, maximum: 127 }, pan: { type: "integer", minimum: 0, maximum: 127 }, reverb: { type: "integer", minimum: 0, maximum: 127 }, chorus: { type: "integer", minimum: 0, maximum: 127 } } },
        annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) {
          const index = Number(input.channel) - 1; if (!Number.isInteger(index) || index < 0 || index > 15) throw new Error("Channel must be 1–16.");
          if (input.voiceNumber !== undefined) { const voice = voices.find((item) => item.no === Number(input.voiceNumber)); if (!voice) throw new Error("That voice is not directly MIDI-selectable."); state.channels[index].voice = { ...voice }; }
          CONTROLS.forEach(({ key }) => { if (input[key] !== undefined) state.channels[index][key] = clampMidi(input[key]); }); renderChannels(); return { channel: index + 1, settings: state.channels[index] };
        },
      },
      {
        name: "transmit_midi_setup", title: "Transmit MIDI setup", description: "Send all 16 configured parts to the currently connected MIDI output.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute() { if (!state.output) throw new Error("No MIDI output is connected."); sendAll(); return { transmitted: true, channels: 16, output: state.output.name }; },
      },
    ];
    tools.forEach((tool) => Promise.resolve(document.modelContext.registerTool(tool)).catch(() => {}));
  }

  FAMILY_RANGES.forEach(([, , family]) => elements.voiceFamily.add(new Option(family, family)));
  elements.connect.addEventListener("click", connectMidi);
  elements.output.addEventListener("change", chooseOutput);
  elements.voiceSearch.addEventListener("input", renderVoices);
  elements.voiceFamily.addEventListener("change", renderVoices);
  document.querySelector("#sendAllButton").addEventListener("click", sendAll);
  document.querySelector("#panicButton").addEventListener("click", panic);
  document.querySelector("#saveButton").addEventListener("click", saveSetup);
  document.querySelector("#libraryButton").addEventListener("click", () => { renderSetupLibrary(); elements.setupDialog.showModal(); });
  document.querySelector("#exportButton").addEventListener("click", exportSetup);
  document.querySelector("#importButton").addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", () => elements.importFile.files[0] && importSetup(elements.importFile.files[0]));
  elements.voiceDialog.addEventListener("click", (event) => { if (event.target === elements.voiceDialog) elements.voiceDialog.close(); });
  elements.setupDialog.addEventListener("click", (event) => { if (event.target === elements.setupDialog) elements.setupDialog.close(); });

  renderChannels();
  updateSetupCount();
  registerWebMcp();
})();
