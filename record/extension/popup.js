document.addEventListener('DOMContentLoaded', function () {
  const startButton = document.getElementById('start');
  startButton.onclick = () => {
    const enableLive = document.getElementById('live_push_enable').checked;
    const livePushUrl = document.getElementById('live_push_url').value;

    const opt = {recordOption: {enableRecord: true}, liveOption: {enableLive, livePushUrl, frameRate:15}};
    console.log(`start record, opt=${JSON.stringify(opt)}`);
    chrome.runtime.sendMessage({CMD: 'START_RECORDING', opt});
  };

  const stopButton = document.getElementById('stop');
  stopButton.onclick = () => {
    chrome.runtime.sendMessage({CMD:'STOP_RECORDING'});
  };
  const pauseButton = document.getElementById('pause');
  pauseButton.onclick = () => {
    chrome.runtime.sendMessage({CMD:'PAUSE_RECORDING'});
  };
  const resumeButton = document.getElementById('resume');
  resumeButton.onclick = () => {
    chrome.runtime.sendMessage({CMD:'RESUME_RECORDING'});
  };
});
