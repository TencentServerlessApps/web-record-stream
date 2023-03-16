const logger = {};
logger.indexes = {};
logger.updatePermanentIndex = (key, value) => {
  logger.indexes[key] = value;
};
logger.log = (...args) => {
  console.log(...args);
};

chrome.runtime.onMessage.addListener((request) => {
  switch (request.CMD) {
    case 'START_RECORDING':
      logger.log('START_RECORDING');
      // todo 这里需要获取当前tab页的url
      startRecording('xxxxx', 'tab url', request.opt);
      break;
    case 'STOP_RECORDING':
      logger.log('STOP_RECORDING');
      stopRecording();
      break;
    case 'PAUSE_RECORDING':
      logger.log('PAUSE_RECORDING');
      pauseRecording();
      break;
    case 'RESUME_RECORDING':
      logger.log('RESUME_RECORDING');
      resumeRecording();
      break;
    default:
      logger.log('UNKNOWN_REQUEST');
  }
});

let isCaptureStarted = false;
let now = new Date().getTime();

let live = {};

let record = {
  recorder: null,
  numRecordedBlobs: 0,
  numRecordedChunks: 0,
  recordedChunks: [],
};

let captureStream = null;

function startRecording(taskID, url, opt) {
  logger.log(`starting to record url=${url}, option=${JSON.stringify(opt)}`);
  const recordOption = opt.recordOption || {};
  const liveOption = opt.liveOption || {};

  // 如果之前已经成功调用过startRecording， 则再次调用的时候用resumeRecording来代替
  if(isCaptureStarted) {
    logger.log('duplicate startRecording, take resumeRecording instead');
    resumeRecording();
    return;
  }

  logger.updatePermanentIndex('TaskID', taskID);


  let fps = 15;

    // check if support live push, current only support tencent live
  if (liveOption.enableLive && liveOption.frameRate) {
    fps = Math.max(liveOption.frameRate, fps);
    logger.log(`[LIVE]set capture min fps=${fps}`);
  }

  const options = {
    audio: true,
    video: true,
    videoConstraints: {
      mandatory:{
        minFrameRate: fps
      }
    }
  };

  logger.log(`[LIVE] start capture, capture option=${JSON.stringify(options)}`);
  chrome.tabCapture.capture(options, (stream) => {
    // chrome.tabCapture.captureOffscreenTab(url, options, (stream) => {
    if (stream === null) {
      logger.log(`[CAPTURE][Error]Last Error: ${chrome.runtime.lastError.message}`);
      isCaptureStarted=false;
      return;
    }
    captureStream = stream;

    logger.log(`[LIVE]check live push, enable=${liveOption.enableLive}, liveOptions=${JSON.stringify(liveOption)}`);
    if (liveOption.enableLive) {
      logger.log(`[LIVE]start live push, liveOptions=${JSON.stringify(liveOption)}`)
      startLivePush(stream, liveOption);
    }

    logger.log(`[RECORD]check reocrd, enable=${recordOption.enableRecord}, reocrdOptions=${JSON.stringify(recordOption)}`);
    if (recordOption.enableRecord) {
      logger.log(`[RECORD]start record, recordOption=${JSON.stringify(recordOption)}`);
      startRecord(stream, recordOption);
    }

    stream.oninactive = () => {
      logger.log('[CAPTURE]stream oninactive');
      try {
        // handle stream inactive
        if (record.recorder && record.recorder.state != 'inactive') {
          record.recorder.stop();
        }
      } catch (err) {
        logger.log(`[CAPTURE][Error]hanle oninactive error, err ${err.message}`)
      }
    };
  });

  isCaptureStarted = true;
}

function pauseRecording() {
  try {
    if (record.recorder && record.recorder.state != 'inactive') {
      record.recorder.pause();
    }
    pauseLivePush();
  } catch (err) {
    logger.log(`[Error]pause record failed, err:${err.message}`);
    throw err.message
  }
}

function resumeRecording(taskID, url, opt) {
  try {
    // 如果没有开始页面采集，需要走startRecording开启页面采集
    // 这个种情况一般是record函数在paused状态的时候出现异常，被重启了
    if(!isCaptureStarted) {
      startRecording(taskID, url, opt);
      return;
    }

    if (record.recorder && record.recorder.state != 'inactive') {
      record.recorder.resume();
    }
    resumeLivePush();
  } catch (err) {
    logger.log(`[Error]resume record failed, err:${err.message}`);
    throw err.message
  }
}

function stopRecording() {
  logger.log('[CAPTURE]stop capture');
  
  if (captureStream) {
    try {
      logger.log(`[CAPTURE]capture stream stop tracks`);
      const tracks = captureStream.getTracks();
      tracks.forEach((track) => {
        track.stop();
      });
    } catch (err) {
      logger.log(`[CAPTURE]stop capture error when stop tracks, err=${err.message}`);
    }
  }

  isCaptureStarted=false;
  try {
    stopRecord();
    stopLivePush();
  } catch (err) {
    logger.log(`[Error]stop failed, err:${err.message}`);
  }

  return record.numRecordedBlobs;
}

function arrayBufferToString(buffer) {
  // Convert an ArrayBuffer to an UTF-8 String

  var bufView = new Uint8Array(buffer);
  var length = bufView.length;
  var result = '';
  var addition = Math.pow(2, 8) - 1;

  for (var i = 0; i < length; i += addition) {
    if (i + addition > length) {
      addition = length - i;
    }
    result += String.fromCharCode.apply(
      null,
      bufView.subarray(i, i + addition),
    );
  }
  return result;
}

function replaceRtmpUrlIfNeeded(url) {
  if (url && url.startsWith('rtmp://')) {
    return url.replace('rtmp://', 'webrtc://');
  }
  return url;
}

function startLivePush(stream, option) {
  logger.log(`[LIVE][start]start live push url=${option.livePushUrl} fps=${option.frameRate}`);
  // see @https://webrtc-demo.myqcloud.com/push-sdk/v2/docs/TXLivePusher.html#setObserver
  if (live.pusher) {
    logger.log(`[LIVE][start]start live skip, pusher exists`);
    return;
  }
  let livePusher = new TXLivePusher();
 
  livePusher.setObserver({
    onError: function(code, msg) {
      logger.log(`[LIVE][ERROR]live push onError, code=${code}, message=${msg}`);
      sendLivePushEvent('disconnected', {code, msg})
    },
    // 推流警告信息
    onWarning: function(code, msg) {
      logger.log(`[LIVE][warning][WARNING]live push onWarning, code=${code}, message=${msg}`);
    },
    // 推流连接状态
    onPushStatusUpdate: function(status, msg) {
      logger.log(`[LIVE][status]live push onPushStatusUpdate, status=${status}, message=${msg}`);
    },
    // 推流统计数据
    onStatisticsUpdate: function(data) {
      console.log('[LIVE][fps]live push video fps is ' + data.video.framesPerSecond);
    }
  });
  
  livePusher.setProperty('setVideoFPS', option.fps);

  // check if start with rtmp://, replace by webrtc://
  const targetUrl = replaceRtmpUrlIfNeeded(option.livePushUrl);

  logger.log(`[LIVE][start]replaceRtmpUrlIfNeeded, originUrl=${option.livePushUrl}, newUrl=${targetUrl}`);
  livePusher.startCustomCapture(stream).then((streamId) => {
    logger.log('[LIVE][start]start custom capture success, streamId='+ streamId);
    livePusher.startPush(targetUrl)
      .then(() => {
        logger.log(`[LIVE][start]live push successful, streamId=${streamId}, pushUrl=${targetUrl}`);
        sendLivePushEvent('publishing', {});
      });
  });
  live.pusher = livePusher;
  sendLivePushEvent('connecting', {});
}

function stopLivePush() {
  logger.log('[LIVE][stop]stop live push');
  if (live.pusher) {
    live.pusher.stopPush();
    live.pusher = null;
  }
  sendLivePushEvent('canceled', '');
}

function pauseLivePush() {
  logger.log('[LIVE][pause]pause live push');
  if (!live.pusher) {
    logger.log('[LIVE][pause]pause live push failed, because live pusher not exist');
    return;
  }
  if (!live.pusher.isPushing()) {
    logger.log('[LIVE][pause]pause live push failed, because live pusher is not pushing');
    return;
  }
  logger.log('[LIVE][pause]]pause live push, mute video audio');
  live.pusher.setVideoMute(true);
  live.pusher.setAudioMute(true);
  sendLivePushEvent('onhold', '');
}

function resumeLivePush() {
  logger.log('[LIVE][resume]resume live push');
  if (!live.pusher) {
    logger.log('[LIVE][resume]resume live push failed, because live pusher not exist');
    return;
  }
  if (!live.pusher.isPushing()) {
    logger.log('[LIVE][resume]resume live push failed, because live pusher is not pushing');
    return;
  }
  logger.log('[LIVE][resume]resume live push, unmute video audio');
  live.pusher.setVideoMute(false);
  live.pusher.setAudioMute(false);
  sendLivePushEvent('publishing', '');
}

function sendLivePushEvent(event, data) {
  logger.log(`[LIVE][event] send live event, event=${event}, msg=${JSON.stringify(data)}`)
  if (window.onLiveEvent) {
    window.onLiveEvent(event, data);
  }
}

function startRecord(stream, recordOption) {
  logger.log(`[RECORD][start]start record, option=${JSON.stringify(recordOption)}`);

  let mimeType = 'video/webm';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
    mimeType = 'video/webm;codecs=h264';
  } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
    mimeType = 'video/webm;codecs=vp8';
  }

  const option = { mimeType };

  let lastLogTime = 0;
  try {
    let rec = new MediaRecorder(stream, option);
    logger.log('[RECORD][start]recroder is in place.');

    rec.ondataavailable = async (event) => {
      const { data: blob, timecode } = event;

      if (event.data.size > 0) {
        const buffer = await event.data.arrayBuffer();
        const data = arrayBufferToString(buffer);
        if (window.sendData) {
          window.sendData(data);
        }

        record.numRecordedBlobs += 1;
        record.numRecordedChunks += event.data.size;

        if (!lastLogTime || new Date().getTime() - lastLogTime > 10000) {
          lastLogTime = new Date().getTime();
          logger.log(
            `[RECORD][onData]recorder ondataavailable Got another blob: ${timecode}: ${blob}, size ${event.data.size}`,
          );
        }
      }
    };
    rec.onerror = () => {
      logger.log('[RECORD][stop][ERROR]recorder onerror, stop ');
      rec.stop();
    };
    
    rec.onstop = () => {
      logger.log('[RECORD][stop]recorder onstop');
    };

    const timeslice = 500;
    rec.start(timeslice);

    record.recorder = rec;
  } catch (err) {
    logger.log(`[RECORD][start][Error]fatal err:${err.message}`);
    return;
  }
}

function stopRecord() {
  if (record.recorder) {
    logger.log(`[RECORD][stop]stop recorder`);
    record.recorder.stop();
    logger.log(
      `[RECORD][stop]stop stop recoder.., total size ${record.numRecordedChunks}, total blobs ${record.numRecordedBlobs}`,
    );
  } else {
    logger.log(`[RECORD][stop]stop recorder, skip recorder is null`);
  }
}