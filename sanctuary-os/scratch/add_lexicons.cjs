const fs = require('fs');

const en = JSON.parse(fs.readFileSync('src/lexicons/en-default.json', 'utf-8'));
const sim = JSON.parse(fs.readFileSync('src/lexicons/en-sims.json', 'utf-8'));
const sanc = JSON.parse(fs.readFileSync('src/lexicons/en-sanctuary.json', 'utf-8'));

const keysToAdd = {
    "theme_view_installed": {
        "en": "VIEW INSTALLED",
        "sim": "SEE WHAT I GOT",
        "sanc": "ACCESS LOCAL DB"
    },
    "theme_upload": {
        "en": "UPLOAD",
        "sim": "ADD MINE",
        "sanc": "IMPORT ASSET"
    },
    "theme_no_images": {
        "en": "No installed images found",
        "sim": "I have no pictures here!",
        "sanc": "Local image repository is empty."
    }
};

for (const [key, vals] of Object.entries(keysToAdd)) {
    if (!en[key]) en[key] = vals.en;
    if (!sim[key]) sim[key] = vals.sim;
    if (!sanc[key]) sanc[key] = vals.sanc;
}

fs.writeFileSync('src/lexicons/en-default.json', JSON.stringify(en, null, 2));
fs.writeFileSync('src/lexicons/en-sims.json', JSON.stringify(sim, null, 2));
fs.writeFileSync('src/lexicons/en-sanctuary.json', JSON.stringify(sanc, null, 2));

console.log("Lexicons updated.");
