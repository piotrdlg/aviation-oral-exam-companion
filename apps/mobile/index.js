// Keep this order: startup crash handlers precede route/module evaluation.
require('./src/lib/crash-reporting');
require('expo-router/entry');
