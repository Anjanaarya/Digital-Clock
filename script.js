let is24h = false;
let alarms = []; // {id, hour, minute, enabled}
let ringingAlarm = null;
let audioCtx = null;
let oscInterval = null;

function pad(n){ return n.toString().padStart(2,'0'); }

function renderClock(){
  const now = new Date();
  const dateEl = document.getElementById('date');
  dateEl.textContent = now.toLocaleDateString(undefined,{weekday:'long', month:'long', day:'numeric'});

  let h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const meridiemEl = document.getElementById('meridiem');

  if(is24h){
    meridiemEl.textContent = '';
    document.getElementById('time').firstChild.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
  } else {
    const suffix = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12; if(h12 === 0) h12 = 12;
    document.getElementById('time').firstChild.textContent = `${pad(h12)}:${pad(m)}:${pad(s)}`;
    meridiemEl.textContent = suffix;
  }

  checkAlarms(h, m, s);
}

function checkAlarms(h, m, s){
  if(ringingAlarm || s !== 0) return;
  const hit = alarms.find(a => a.enabled && a.hour === h && a.minute === m);
  if(hit) triggerAlarm(hit);
}

function triggerAlarm(alarm){
  ringingAlarm = alarm;
  document.getElementById('ringTime').textContent = `${pad(alarm.hour)}:${pad(alarm.minute)}`;
  document.getElementById('overlay').classList.add('active');
  startBeep();
}

function startBeep(){
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const beep = () => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  };
  beep();
  oscInterval = setInterval(beep, 500);
}

function stopBeep(){
  if(oscInterval) clearInterval(oscInterval);
  if(audioCtx) audioCtx.close();
  oscInterval = null;
  audioCtx = null;
}

function dismissAlarm(){
  document.getElementById('overlay').classList.remove('active');
  stopBeep();
  ringingAlarm = null;
}

function snoozeAlarm(){
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  const snoozed = { id: crypto.randomUUID(), hour: now.getHours(), minute: now.getMinutes(), enabled: true };
  alarms.push(snoozed);
  renderAlarms();
  dismissAlarm();
}

function addAlarm(){
  const input = document.getElementById('alarmInput');
  if(!input.value) return;
  const [h, m] = input.value.split(':').map(Number);
  alarms.push({ id: crypto.randomUUID(), hour: h, minute: m, enabled: true });
  alarms.sort((a,b) => a.hour === b.hour ? a.minute - b.minute : a.hour - b.hour);
  input.value = '';
  renderAlarms();
}

function toggleAlarm(id){
  const a = alarms.find(x => x.id === id);
  if(a) a.enabled = !a.enabled;
  renderAlarms();
}

function deleteAlarm(id){
  alarms = alarms.filter(x => x.id !== id);
  renderAlarms();
}

function formatAlarmTime(h, m){
  if(is24h) return `${pad(h)}:${pad(m)}`;
  const suffix = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12; if(h12 === 0) h12 = 12;
  return `${pad(h12)}:${pad(m)} ${suffix}`;
}

function renderAlarms(){
  const list = document.getElementById('alarmList');
  list.innerHTML = '';
  if(alarms.length === 0){
    list.innerHTML = '<div class="empty">No alarms set</div>';
    return;
  }
  alarms.forEach(a => {
    const li = document.createElement('li');
    li.className = 'alarm-row' + (a.enabled ? '' : ' disabled');
    li.innerHTML = `
      <span class="alarm-time">${formatAlarmTime(a.hour, a.minute)}</span>
      <span class="alarm-controls">
        <label class="switch">
          <input type="checkbox" ${a.enabled ? 'checked' : ''} data-id="${a.id}" class="toggle-input">
          <span class="slider"></span>
        </label>
        <button class="delete-btn" data-id="${a.id}">✕</button>
      </span>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll('.toggle-input').forEach(el => {
    el.addEventListener('change', () => toggleAlarm(el.dataset.id));
  });
  list.querySelectorAll('.delete-btn').forEach(el => {
    el.addEventListener('click', () => deleteAlarm(el.dataset.id));
  });
}

document.getElementById('addAlarmBtn').addEventListener('click', addAlarm);
document.getElementById('dismissBtn').addEventListener('click', dismissAlarm);
document.getElementById('snoozeBtn').addEventListener('click', snoozeAlarm);
document.getElementById('modeToggle').addEventListener('click', () => {
  is24h = !is24h;
  document.getElementById('modeToggle').textContent = is24h ? 'Switch to 12h' : 'Switch to 24h';
  renderAlarms();
});

renderAlarms();
renderClock();
setInterval(renderClock, 1000);


/* ---------- Tabs ---------- */

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab + 'Panel').classList.add('active');
  });
});

/* ---------- Stopwatch ---------- */

let swRunning = false;
let swStartTime = 0;     // timestamp when current run started
let swElapsed = 0;       // accumulated ms across runs
let swRAF = null;
let laps = [];           // array of ms elapsed at time of lap

const swStartBtn = document.getElementById('swStartBtn');
const swLapBtn = document.getElementById('swLapBtn');
const swResetBtn = document.getElementById('swResetBtn');
const swTimeEl = document.getElementById('stopwatchTime');
const swMsEl = document.getElementById('stopwatchMs');
const lapListEl = document.getElementById('lapList');

function formatStopwatch(ms){
  const totalCentis = Math.floor(ms / 10);
  const centis = totalCentis % 100;
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const main = hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;

  return { main, centis: pad(centis) };
}

function renderStopwatch(){
  const currentElapsed = swRunning ? (swElapsed + (performance.now() - swStartTime)) : swElapsed;
  const { main, centis } = formatStopwatch(currentElapsed);
  swTimeEl.firstChild.textContent = main;
  swMsEl.textContent = `.${centis}`;

  if(swRunning){
    swRAF = requestAnimationFrame(renderStopwatch);
  }
}

function startStopwatch(){
  swRunning = true;
  swStartTime = performance.now();
  swStartBtn.textContent = 'Stop';
  swStartBtn.classList.add('running');
  swLapBtn.disabled = false;
  swResetBtn.disabled = false;
  renderStopwatch();
}

function stopStopwatch(){
  swRunning = false;
  swElapsed += performance.now() - swStartTime;
  swStartBtn.textContent = 'Start';
  swStartBtn.classList.remove('running');
  swLapBtn.disabled = true;
  if(swRAF) cancelAnimationFrame(swRAF);
}

function resetStopwatch(){
  swRunning = false;
  swElapsed = 0;
  laps = [];
  if(swRAF) cancelAnimationFrame(swRAF);
  swStartBtn.textContent = 'Start';
  swStartBtn.classList.remove('running');
  swLapBtn.disabled = true;
  swResetBtn.disabled = true;
  renderStopwatch();
  renderLaps();
}

function addLap(){
  const currentElapsed = swElapsed + (performance.now() - swStartTime);
  laps.push(currentElapsed);
  renderLaps();
}

function renderLaps(){
  lapListEl.innerHTML = '';
  if(laps.length === 0){
    lapListEl.innerHTML = '<div class="empty">No laps yet</div>';
    return;
  }
  laps.forEach((lapMs, i) => {
    const { main, centis } = formatStopwatch(lapMs);
    const li = document.createElement('li');
    li.className = 'lap-row';
    li.innerHTML = `
      <span class="lap-num">Lap ${i + 1}</span>
      <span class="lap-time">${main}.${centis}</span>
    `;
    lapListEl.appendChild(li);
  });
  lapListEl.scrollTop = 0;
}

swStartBtn.addEventListener('click', () => {
  if(swRunning) stopStopwatch();
  else startStopwatch();
});
swLapBtn.addEventListener('click', addLap);
swResetBtn.addEventListener('click', resetStopwatch);

renderStopwatch();