const tinyspeck = require("tinyspeck");
const he = require("he");
const immutable = require("immutable");
const fs = require("fs");
const lambda = require("@calculemus/abt-lambda");
const storage = require("node-persist");

const Set = immutable.Set;
const slack = tinyspeck.instance({
  token: process.env.BOT_TOKEN
});

storage.initSync({ dir: ".data/storage" });

// Utility function for replies
function reply(message, text) {
  return slack.send({
    text: text,
    channel: message.event.channel
  }).then(data => {
    console.log(data.ok ? `${message.event_id} returned message` : `${message.event_id} failed`)
  });
}

function log(source, code, message) {
  const payload = typeof message === "string"
    ? message
    : `${message.event.ts} ${message.event_id} ${message.event.type} ${message.event.user || "_no user_"} ${message.event.subtype || ""}`;
  fs.appendFile(".data/log.txt", `${source} ${code}: ${payload}\n`, () => { return; }); 
}

// Main logic
function goAlonzoGo(message, source, input) {
  if (message.event.subtype === "bot_message") {
    log(source, "bot", message);
    return;
  }
  
  storage.getItem(message.event_id).then(isDuplicateRequest => {
    log(source, isDuplicateRequest ? "dup" : "res", message);
    if (isDuplicateRequest) throw new Error("Duplicate");
    return storage.setItem(message.event_id, input);
  }).then(() => {
    try {
      const [fv, e] = lambda.parse(input);
      const parsed = lambda.toString(e);
      console.log(`${message.event_id} parsed as ${parsed}`);
      fs.appendFile(".data/terms.txt", `${message.event_id} ${parsed}\n`, () => { return; });
      try {
        const [gas, norm] = lambda.callByName.normalize(900, fv, e);
        const result = lambda.toString(norm);
        console.log(`${message.event_id} evaluated ${result}`);
        reply(message, `\`\`\`${result}\n\`\`\``);
      } catch (e) {
        reply(message, `Ran out of gas evaluating this expression`);
      }
    } catch (e) {
      console.log(`${message.event_id} parse error`);
      reply(message, `\`\`\`\n${e}\`\`\``);
    }
  }).catch(() => {
    console.log(`${message.event_id} duplicate`);
  });
}

slack.on('app_mention', message => {
  if (!message.event.text) {
    //console.log(message.event);
    log("AM", "ntx", message);
  } else {
    const text = message.event.text.substring(message.event.text.lastIndexOf(">") + 2);
    goAlonzoGo(message, "AM", he.decode(text));
  }
});

slack.on('message', message => {
  if (!message.event.text) {
    //console.log(message.event);
    log("DM", "ntx", message);
  } else {
    goAlonzoGo(message, "DM", he.decode(message.event.text));
  }
});

slack.listen(process.env.PORT, process.env.VERIFICATION_TOKEN);