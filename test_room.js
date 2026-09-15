// Quick Socket.IO integration test using two simulated clients
const { io } = require('socket.io-client');

const BASE = 'http://localhost:3001';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('\n=== iTantra Room System Test ===\n');

  // Device A — Sender
  const sender = io(BASE, { transports: ['websocket'] });
  await new Promise((res, rej) => {
    sender.on('connect', () => { console.log('✅ Sender connected:', sender.id); res(); });
    sender.on('connect_error', rej);
    setTimeout(rej, 5000);
  });

  // Device A creates room
  let roomCode = '';
  sender.emit('create_room');
  await new Promise(res => sender.once('room_created', ({ code }) => { roomCode = code; console.log('✅ Room created:', code); res(); }));

  // Device B — Receiver
  const receiver = io(BASE, { transports: ['websocket'] });
  await new Promise((res, rej) => {
    receiver.on('connect', () => { console.log('✅ Receiver connected:', receiver.id); res(); });
    receiver.on('connect_error', rej);
    setTimeout(rej, 5000);
  });

  // Device B joins room
  receiver.emit('join_room', { code: roomCode });
  await Promise.all([
    new Promise(res => receiver.once('room_joined', () => { console.log('✅ Receiver joined room'); res(); })),
    new Promise(res => sender.once('receiver_connected', () => { console.log('✅ Sender notified: receiver connected'); res(); })),
  ]);

  // Device A sends a message
  console.log('\n--- Sending: "मैं सोने जा रहा हूँ।" (hi → en) ---');
  sender.emit('send_message', { text: 'मैं सोने जा रहा हूँ।', sourceLang: 'hi-IN', targetLang: 'en-IN' });

  // Device B receives the translated message
  await new Promise((res, rej) => {
    receiver.once('receive_message', ({ originalText, translatedText }) => {
      console.log(`✅ Received on Device B:`);
      console.log(`   Original:   "${originalText}"`);
      console.log(`   Translated: "${translatedText}"`);
      res();
    });
    setTimeout(() => rej(new Error('Timed out waiting for message')), 10000);
  });

  sender.disconnect();
  receiver.disconnect();
  console.log('\n✅ All tests passed!\n');
}

run().catch(e => { console.error('\n❌ TEST FAILED:', e.message); process.exit(1); });
