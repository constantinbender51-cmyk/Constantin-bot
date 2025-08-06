const express = require('express');
const path = require('path');

const app = express();
// Railway provides the PORT environment variable.
const port = process.env.PORT || 3000;

// 1. Serve all static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// 2. This route is now a fallback. If a user goes to '/',
//    the middleware above will automatically find and serve 'index.html'
//    from the 'public' folder. You can actually remove this route handler
//    for a simple static site, but it's good to keep for clarity.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  // This log is very helpful for debugging on Railway!
  console.log(`Server is listening on port ${port}`);
});
