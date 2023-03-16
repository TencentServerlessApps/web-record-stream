const index = require('./index');

const event = {
  TaskID: '6ea9f5ec-3eaf-42ac-875e-dce6c8dd4117',
};

const context = {
  request_id: '450d184e-19ff-4cc5-bd02-5cd1fe811e9f',
};
index.main_handler(event, context);
