import {loadConfig} from './lib/config.js';
import {createApp} from './app.js';
import {log} from './lib/log.js';
try {
  const config=loadConfig();
  const app=createApp({config});
  await app.engine.ready;
  const server=app.server();
  server.requestTimeout=30000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  server.listen(config.port,config.host,()=>log('info','server_started',{port:config.port,providers:app.manifest.name}));
  process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
  process.on('SIGINT',()=>server.close(()=>process.exit(0)));
}catch(error){log('error','startup_failed',{status:error.message});process.exitCode=1;}
