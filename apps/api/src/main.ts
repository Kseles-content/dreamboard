import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3000);

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.statusCode = 404;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ message: 'Not Found' }));
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on :${port}`);
});
