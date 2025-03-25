const moment = require('moment');

function formatMessage(username, userId, text) {
  return {
    username,
    userId,
    text,
    time: moment().format('HH:mm')
  };
}

module.exports = formatMessage; 