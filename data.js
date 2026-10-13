// Collection data. Edit this file to add or change items.
// `img` is a file name in Images/web (leave it out if there's no photo).
// `group` draws a divider line above the first row of each new group.

const SETUPS = [
  { group: "drm", img: "DrMCustom.png",       name: "Dr. M's Research Institute 33mm * Blue/White/Black/Pink (f)", trucks: "Joycult x Indepedent 32mm Silver", wheels: "Joycult Classic 3.0 Street Tan" },
  { group: "drm", img: "DrMBluePink.png",     name: "Dr. M's Research Institute 30mm* Mystery Blue/Pink (f)",     trucks: "Joycult x Indepedent 29mm Silver", wheels: "Joycult Classic 3.0 Street Blue/Pink" },
  { group: "drm", img: "DrMGreen.png",        name: "Dr. M's Research Institute 32mm Midnight Green (f)",         trucks: "Joycult x Indepedent 32mm Silver", wheels: "Piro Performance White" },
  { group: "drm", img: "DrMxNotCool.png",     name: "Dr. M's Research Institute x Not Cool 32.5mm  (f)",          trucks: "Joycult x Indepedent 32mm Silver", wheels: "Flatface x Blistered v3 White/Yellow" },
  { group: "drm", img: "DrMWhiteBlack.png",   name: "Dr. M's Research Institute 29.5mm White/Black (f)",          trucks: "Joycult x Indepedent 29mm Silver", wheels: "Bloob Dogshit White" },
  { group: "drm", img: "DrMBlank.png",        name: "Dr. M's Research Institute 29mm Blank Blue (f)",             trucks: "Joycult x Indepedent 29mm Silver", wheels: "Daytona 7mm White" },
  { group: "drm", img: "DrMOrange.png",       name: "Dr. M's Research Institute 29mm Orange (f)",                 trucks: "Joycult x Indepedent 29mm Silver", wheels: "Oak Rv2 Tan" },
  { group: "drm", img: "DrMCatfish.png",      name: "CATFISHBBQ x Dr. M's Research Institute Raw/Black (d)",      trucks: "Joycult x Indepedent 34mm Silver", wheels: "Joycult Classic 3.0 Street Pistachio" },
  { group: "drm", img: "Teeth.png",           name: "CATFISHBBQ Teeth 32mm (f)",                                  trucks: "Leefai 32mm Silver",               wheels: "Joycult Classic 3.0 Matt Era Pink/Blue" },
  { group: "drm", img: "HerMajesty.png",      name: "CATFISHBBQ Her Majesty 30mm Pink (f)",                       trucks: "Blackriver/Leefai 29mm Silver",    wheels: "Blistered x John Cowart Black" },
  { group: "drm", img: "ArtshowRealWear.png", name: "CATFISHBBQ Artshow Real Wear 32mm Black/Wood (f)",           trucks: "Y Trucks 32mm Raw",                wheels: "Y Wheels Tan" },
  { group: "worm", img: "WormGraffitiJ.png",  name: "Worm Graffiti 34mm (h)",                                     trucks: "Joycult x Indepedent 32mm Silver", wheels: "Oak R2V2 Tan" },
  { group: "worm", img: "WormApple.png",      name: "Worm Apple 32mm (h)",                                        trucks: "Blackriver 4.0 32mm Raw",          wheels: "Bloob Micro Red" },
  { group: "worm", img: "WormBox.png",        name: "Worm Box Head 32mm (h)",                                     trucks: "Leefai 32mm Silver",               wheels: "Flatface Cores Blue" },
  { group: "cowply", img: "CowplySilver.png", name: "Cowply Egg 34mm Black/Silver (c2)",                          trucks: "Blackriver 3.0 34mm Silver/Gold Mixed", wheels: "Joycult Lite Pink/Black" },
  { group: "cowply", img: "CowplyHead.png",   name: "Cowply Face Cruiser 34mm Blue (c2)",                         trucks: "Dynamic Inverted Kingpin 32mm Silver",  wheels: "Abstract B Purple" },
  { group: "letter", img: "LetterLebron.png", name: "Letter Lebron 29mm White (m)",                               trucks: "Leefai 32mm Raw",                  wheels: "Blistered x Cowart Blue" },
  { group: "almost", img: "AlmostTechDeck.png", name: "Almost x Tech Deck Cruiser 26mm",                          trucks: "Tech Deck Trucks 26mm",            wheels: "Dynamic Bowl Pink" },
];

const DECKS = [
  { group: "catfish", img: "Wish32mm.png",       name: "Wish, Natural/Blue",          maker: "CATFISHBBQ", mold: "Freshwater", size: "32mm" },
  { group: "catfish", img: "Washi30mm.png",      name: "Washi, Purple/Red/White",     maker: "CATFISHBBQ", mold: "Freshwater", size: "30mm" },
  { group: "catfish", img: "Washi32mm.png",      name: "Washi, Brown/Gold",           maker: "CATFISHBBQ", mold: "Freshwater", size: "32mm" },
  { group: "cowply",  img: "TrueTypeDinamo.png", name: "ABC Dinamo Truetype, White",  maker: "Cowply",     mold: "c2",         size: "32mm" },
  { group: "cowply",  img: "BulletDinamo.png",   name: "ABC Dinamo Bullets, Blue",    maker: "Cowply",     mold: "c2",         size: "32mm" },
  { group: "cowply",  img: "cowplyred34mm.png",  name: "Cowply Wordmark, Red",        maker: "Cowply",     mold: "c2",         size: "34mm" },
  { group: "dynamic", img: "Dynamic32mm.png",    name: "Graffiti, Red/Natural",       maker: "Dynamic",    mold: "Medium",     size: "32mm" },
  { group: "foard",   img: "Foard34mm.png",      name: "Broadcast Systems, Red/Natural", maker: "Foard",   mold: "Medium",     size: "34mm" },
];

const WHEELS = [
  { group: "a", img: "OakMini.png",        name: "Oak Mini",         color: "Tan",    material: "Urethane", duro: "64d" },
  { group: "b", img: "AbstractBStock.png", name: "Abstract B Stock", color: "Purple", material: "Urethane", duro: "Unknown" },
];

const TRUCKS = [
  { group: "a", img: "Blackriver32mm.png", name: "Blackriver 32mm", color: "Raw", size: "32mm" },
];
