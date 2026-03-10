"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const ingest_ab_gov_1 = require("./ab_stations/ingest_ab_gov");
const fs = __importStar(require("fs"));
// import * as path from 'path';
const data = {
    timestamp: new Date().toISOString(),
    readings: [ /* your data */]
};
// Ensure you write to the MOUNTED directory
const outputPath = './data/ALL_STATIONS.json';
(async () => {
    try {
        const stationReadings = await (0, ingest_ab_gov_1.fetch_all_stations)();
        data.readings = stationReadings;
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
        console.log('Data flushed to shared volume.');
    }
    catch (err) {
        console.error('Failed to write to volume:', err);
    }
})();
