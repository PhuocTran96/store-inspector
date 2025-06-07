const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  stt: String,
  tdlName: String,
  tdsName: String,
  promoterName: String,
  typeShop: String,
  headcountInvest: String,
  headcountActive: String,
  seniority: String,
  storeName: String,
  storeCode: String,
  dealerCode: String,
  address: String,
  storeType: String,
  channel: String,
  keyCities: String,
  nearestKeyCity: String,
  rankingCommune: String,
  base: String,
  shopTier: String,
  region: String,
  province: String,
  city: String,
  district: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Store', storeSchema);
