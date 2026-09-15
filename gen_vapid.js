const wp = require('web-push');
const keys = wp.generateVAPIDKeys();
console.log(JSON.stringify(keys, null, 2));
