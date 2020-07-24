let taskName = 'dc_events_tracking_task';
export let constants = {
    mailingList: ["rahulsaini@thb.co.in"],
    emailId: ['rahulsaini@thb.co.in', 'common@thb.co.in'],
    taskName: taskName,
    getTaskName: function() {
        let taskN = taskName;
        console.log("Node ENV - ", process.env.NODE_ENV);
        if (process.env.NODE_ENV != "production") {
            taskN += "_beta";
            console.log(taskN);
        }
        return taskN;
    },
    moduleName: 'dc-events-tracking',
    ES_HOST: 'https://search-events-n75vn37vur3qis7v2a3qi7iyg4.ap-south-1.es.amazonaws.com',
    ES_API_VERSION: '7.1',
    // ES_EVENT_INDEX: 'allevents_updated',
    ES_EVENT_INDEX: 'allevents_production',
    ES_EVENT_INDEX_PROD: 'allevents_production',
    ES_WHAtSAPP_INDEX: 'whatsapp_log',
    ES_EVENT_INDEX_BACKUP_PROD: 'allevents_production_backup',
    ES_WHAtSAPP_INDEX_BACKUP_PROD: 'whatsapp_log_production_backup',
    patients_appnames: ['pc', 'pe', 'en', 're', 'ly', 'dmr', 'nps'],
    ES_SIZE_LIMIT: 10000, //highest limit of ES
    labSettings: 'lab_settings',
    labSettingsBeta: 'lab_settings_beta',
    liveLabs: 'livelabs',
    liveEventsLabs:'live_events_labs',
    pepV2: 'pepv2',
    aggColumns: ['appname', 'source', 'channel', 'category', 'action', 'label', 'value', 'userid', 'useragent', 'cid', 'createddate'],
    aggColumnsProd: ['appname', 'source', 'channel', 'category', 'action', 'label', 'value', 'userid', 'useragent', 'cid', 'createddate'],
    bucket: 'currae',
    betaTable: 'pep_events_dev',
    betaDb: 'etl_raw_dmrdev1',
    prodLiveDb: 'liverun',
    prodTable: 'pep_events_prod',
    cache_table: 'athena-cache-layer',
    athenaOutputDirectory: 's3://athena-query-executions/events',
    encryptionOption: 'SSE_S3',
    ttlInHoursConst : 12,
    eventDailyMigrationPipelineName :'pep-events-migration',
    eventsMigrationPipelineName :'dmr-event-daily-migration',
    whatsAppEventDailyMigrationPipelineName :'whatsapp-events-daily-migration',
    eventDailyMigrationPipelineArn : 'arn:aws:states:ap-south-1:983637169828:stateMachine:pep-events-migration',
    dmrEventsDailyMigrationPipelineArn : 'arn:aws:states:ap-south-1:983637169828:stateMachine:dmr-event-daily-migration',
    whatsAppEventDailyMigrationPipelineArn : 'arn:aws:states:ap-south-1:983637169828:stateMachine:whatsapp-events-daily-migration',
    emailBlockTable: 'email_blocklist',
    smsBlockTable: 'lab_blocklist',
    dmrEmailBlockTable: 'dmr_email_blocklist',
    dmrSmsBlockTable: 'dmr_blocklist',
    getBucketName : function() {
        if(process.env.NODE_ENV == 'production'){
            return 'thb-communications'
        }
        return 'thb-communications-beta'
    },
    cacheTable : 'athena-cache-layer',
    getRoiSheetLambda : function () {
        if (process.env.NODE_ENV != 'production') {
            return 'athena-layer-extension-dev-roisheetdownload';
        }
        return 'athena-layer-extension-prod-roisheetdownload';
    },
   getAthenaQueryExecutionsBucket :  function () {
        if (!process.env.NODE_ENV || process.env.NODE_ENV != 'production') {
            return 'athena-query-executions-beta';
        }
        return 'athena-query-executions';
    },
    database : function() {
        if (process.env.NODE_ENV != 'production') {
            return "dmr_ppe115";
        }
        return "dmr_prod19";
    },
    ttlInHoursDataConst : 2,
    ESdatabase :function () {
        if (process.env.NODE_ENV != 'production') {
            return 'pep_events_dev';
        }
        return 'pep_events_prod';
    },
    campignDB : function(){
        if(process.env.NODE_ENV != 'production'){
            return "liverun_beta";
        }
        return "liverun";
    },
    campignDB_beta : function(){
        if(process.env.NODE_ENV != 'production'){
            return "liverun";
        }
        return "liverun";
    },
    ESdatabase_beta :function () {
        if (process.env.NODE_ENV != 'production') {
            return 'pep_events_prod';
        }
        return 'pep_events_prod';
    },
    patientDB: function(){
        if(process.env.NODE_ENV != 'production'){
            return "etl_merged_ppe115";
        }
        return "etl_merged_prod19";
    },
    syncLeadDB: function(){
        if(process.env.NODE_ENV != 'production'){
            return "sync_clean_leads_beta"
        }
        return "sync_clean_leads"
    },
    lambdaInVpcSnsArnMap : {
        loyalty: 'string'
    },

    bitlinkDB: function(){
        if(process.env.NODE_ENV != 'production'){
            return 'bitlink_beta';
        }
        return 'bitlink';
    },
    ttlValue: function () {
        return (2629743 * 2);
    },
    
    
}
