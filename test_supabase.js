const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://gxqowjjwhmbvvzuixcix.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4cW93amp3aG1idnZ6dWl4Y2l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NjA2NjQsImV4cCI6MjA5OTIzNjY2NH0.tJLMJ-SDZpqcYIx0izkFff_lP9wBkQDMHt7cnVVANAQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const channel = supabase.channel('test-channel', { config: { presence: { key: 'test-user' } } });
channel.on('presence', { event: 'sync' }, () => {
  console.log('Presence sync:', channel.presenceState());
}).subscribe(async (status) => {
  console.log('Subscribe status:', status);
  if (status === 'SUBSCRIBED') {
    await channel.track({ user: 'test' });
    setTimeout(() => {
       channel.send({ type: 'broadcast', event: 'TEST', payload: { ok: true } })
       .then(res => console.log('Broadcast res:', res))
       .catch(err => console.log('Broadcast err:', err));
    }, 1000);
  }
});
