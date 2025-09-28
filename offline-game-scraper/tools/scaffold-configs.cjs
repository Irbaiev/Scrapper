// node tools/scaffold-configs.js --dist dist/bananza
const fs = require('fs'); 
const path = require('path'); 
const m = require('minimist');

const ensure = (p, content) => { 
  if (!fs.existsSync(p)) { 
    fs.mkdirSync(path.dirname(p),{recursive:true}); 
    fs.writeFileSync(p, JSON.stringify(content,null,2)); 
    return true 
  } 
  return false 
}

(async()=>{
  const { dist } = m(process.argv.slice(2)); 
  if(!dist) throw new Error('--dist required');
  
  const platformConfig = {
    "gameUrl": "https://staging.playzia.com/games/playzia-bananabonanza/",
    "gameId": "playzia-bananabonanza",
    "gameName": "Banana Bonanza",
    "provider": "Playzia",
    "currency": "EUR",
    "language": "en",
    "theme": "default",
    "launchUrl": "https://staging.playzia.com/games/",
    "apiUrl": "https://api.playzia.staging.hizi-service.com/gameapi/v2/",
    "features": {
      "autoplay": true,
      "sound": true,
      "fullscreen": true,
      "mobile": true
    },
    "api": {
      "baseUrl": "https://api.playzia.staging.hizi-service.com",
      "gameApiUrl": "https://api.playzia.staging.hizi-service.com/gameapi/v2",
      "wsUrl": "wss://ws.playzia.staging.hizi-service.com"
    },
    "ui": {
      "showBalance": true,
      "showBet": true,
      "showWin": true,
      "showHistory": true
    }
  };
  
  const a = ensure(path.join(dist,'mirror/staging.playzia.com/casino/configuration/platformConfig.json'), platformConfig);
  console.log(`platformConfig.json: ${a?'создан':'существует'}`);
})();
