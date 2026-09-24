// Bridge between the dashboard pages and the main process. Only for app:// pages.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
    closeEditor: () => ipcRenderer.send('editor:close'),
    openWebSearch: (query, engine) => ipcRenderer.send('web:open', { query, engine }),
    webBack: () => ipcRenderer.send('web:back'),
    onApplyImage: cb => ipcRenderer.on('apply-image', (_e, data) => cb(data)),
    onWebState: cb => ipcRenderer.on('web:state', (_e, data) => cb(data)),
    onWebNav: cb => ipcRenderer.on('web:nav', (_e, data) => cb(data)),
    onWebToast: cb => ipcRenderer.on('web:toast', (_e, msg) => cb(msg)),
    onOpenPanel: cb => ipcRenderer.on('editor:panel', (_e, panel) => cb(panel)),

    // Alarms
    getAlarms: () => ipcRenderer.invoke('alarms:get'),
    saveAlarms: list => ipcRenderer.invoke('alarms:save', list),
    pickAlarmSound: () => ipcRenderer.invoke('alarms:pick-sound'),
    alarmAction: (id, action) => ipcRenderer.send('alarm:action', { id, action }),
    onAlarmsChanged: cb => ipcRenderer.on('alarms:changed', () => cb()),

    minimizeEditor: () => ipcRenderer.send('editor:minimize'),
    openWindows: target => ipcRenderer.invoke('windows:open', target),  // 'weather' | 'battery' | 'location'
    parseWhen: (text, mode) => ipcRenderer.invoke('when:parse', { text, mode }),

    // Google Calendar
    googleStatus: () => ipcRenderer.invoke('google:status'),
    googleSignIn: () => ipcRenderer.invoke('google:sign-in'),
    googleCancelSignIn: () => ipcRenderer.invoke('google:cancel-sign-in'),
    googleSignOut: () => ipcRenderer.invoke('google:sign-out'),
    googleCalendars: () => ipcRenderer.invoke('google:calendars'),
    createEvent: (calendarId, event) => ipcRenderer.invoke('events:create', { calendarId, event }),
    updateEvent: (calendarId, eventId, event) => ipcRenderer.invoke('events:update', { calendarId, eventId, event }),
    deleteEvent: (calendarId, eventId) => ipcRenderer.invoke('events:delete', { calendarId, eventId }),

    // Calendars
    getCalendars: () => ipcRenderer.invoke('calendars:get'),
    addCalendar: feed => ipcRenderer.invoke('calendars:add', feed),
    removeCalendar: id => ipcRenderer.invoke('calendars:remove', id),
    chooseCalendarFolder: () => ipcRenderer.invoke('calendars:choose-folder'),
    clearCalendarFolder: () => ipcRenderer.invoke('calendars:clear-folder'),
    onCalendarsChanged: cb => ipcRenderer.on('calendars:changed', () => cb()),
});
