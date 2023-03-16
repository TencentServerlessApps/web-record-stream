const { logger } = require('common');
const index = require('./index');

async function startRecord() {
  logger.log('start record');
  const data = {
    Action: 'Start',
    Data: {
      RecordURL: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    },
  };
  const event = {
    body: JSON.stringify(data),
  };
  return await index.main_handler(event, '');
}

async function stopRecord(taskID) {
  logger.log('stop');
  const data = {
    Action: 'Cancel',
    Data: {
      TaskID: taskID,
    },
  };
  const event = {
    body: JSON.stringify(data),
  };
  return await index.main_handler(event, '');
}

async function describe(taskID) {
  logger.log('describe');
  const data = {
    Action: 'Describe',
    Data: {
      TaskID: taskID,
    },
  };
  const event = {
    body: JSON.stringify(data),
  };
  return await index.main_handler(event, '');
}

// startRecord()
stopRecord('6ea9f5ec-3eaf-42ac-875e-dce6c8dd4117');
// describe("6ea9f5ec-3eaf-42ac-875e-dce6c8dd4117")
