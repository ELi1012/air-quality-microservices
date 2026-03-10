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
exports._read_data = _read_data;
exports._write_data = _write_data;
exports.formatToLocalISO = formatToLocalISO;
exports.normalizeTimestamp = normalizeTimestamp;
exports.parseNumber = parseNumber;
exports.dateInRange = dateInRange;
const fs = __importStar(require("fs"));
const date_fns_tz_1 = require("date-fns-tz");
function _read_data(filepath) {
    try {
        const raw = fs.readFileSync(filepath, "utf-8");
        const data = JSON.parse(raw);
        return data;
    }
    catch (error) {
        throw new Error(`Could not read data at ${filepath}`);
    }
}
function _write_data(filepath, data, indentation = 2) {
    // data can be any js value (usually object, array)
    try {
        fs.writeFileSync(filepath, JSON.stringify(data, null, indentation));
    }
    catch (error) {
        console.log(error);
        throw new Error(`Could not write data to ${filepath}`);
    }
}
function formatToLocalISO(date) {
    // 'XXX' in the pattern prints the timezone offset (e.g., -06:00 or -07:00)
    // 'America/Edmonton' ensures it checks the AB rules for that specific date
    return (0, date_fns_tz_1.formatInTimeZone)(date, 'America/Edmonton', "yyyy-MM-dd'T'HH:mm:ssXXX");
}
/**
 * Ensures the timestamp input is converted to a valid Unix timestamp.
 * This prevents "Invalid Date" from polluting your AQHI calculations.
 */
function normalizeTimestamp(timestamp) {
    const parsed = new Date(timestamp).getTime();
    if (isNaN(parsed)) {
        throw new Error(`Invalid timestamp provided: ${timestamp}`);
    }
    else if (parsed > new Date().getTime()) {
        throw new Error(`reference timestamp (${timestamp}) cannot be in the future.`);
    }
    return parsed;
}
// handles cases where number is a string like '1.2'
function parseNumber(val) {
    if (val === null || val === undefined || val === '')
        return null;
    const parsed = Number(val);
    return isNaN(parsed) ? null : parsed;
}
;
// inclusive of both start and end
function dateInRange(ts, start, end) {
    return ts.getTime() >= start.getTime() && ts.getTime() <= end.getTime();
}
