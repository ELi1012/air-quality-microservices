"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const pa_access_js_1 = require("./db/pa_access.js");
const station_access_js_1 = require("./db/station_access.js");
const app = (0, express_1.default)();
const port = 8080;
app.get('/api/pa-recent', async (req, res) => {
    try {
        const readings = await (0, pa_access_js_1.getLatestReadings)();
        res.json(readings);
    }
    catch (err) {
        return res.status(500).json({ error: 'Could not load PurpleAir data' });
    }
});
app.get('/api/fem-stations-recent', async (req, res) => {
    try {
        const measurements = await (0, station_access_js_1.getLatestStationMeasurements)();
        res.json(measurements);
    }
    catch (err) {
        return res.status(500).json({ error: 'Could not load FEM station data' });
    }
});
app.listen(port, () => {
    console.log(`API running on port ${port}`);
});
