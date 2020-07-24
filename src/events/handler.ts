import objectHash = require("object-hash");

import {
    APIGatewayEvent,
    Callback,
    Context,
    Handler
} from 'aws-lambda';
var momenttz = require('moment-timezone');

const HttpAmazonESConnector = require('./esconnector');



import {
    pushEventToQueue,
    pushEventToES,
    searchES,
    fetchEventsFromES,
    deleteEventsFromEs,
    getV2LiveLabs,
    invokeLambda,
    generateS3Key,
    uploadOnS3Internal,
    isEventPep,
    formatChannelName,
    getAggregateDataFromEthena,
    isProduction,
    migrateToProdEventBackupIndex,
    getEsIndex,
    executeStepFunction,
    getItem,
    callAnotherLambda,
    fetchDataFromES,
    getWhatsAppEsIndex,
    generateS3KeyForWhatsapp,
    migrateEsDataForBackup,
    uploadOnS3InternalForWhatsApp,
    generateIndex,
    getEventsLiveLabs,
    clone,
    generateCacheKeyForSendData,
    checkForCacheHitQB,
    getNowDate,
    invokeTriggerLambda,
    updateCacheKeyForNewDataQuery,
    getRowsFromAthena,
    // testEvents
    batchWriteData,
    getEPOCHSeconds
} from './index';

import {
    getDownloadQuery,
    campaignListQuery,
    // getDownloadStatsQuery
} from './query-builder';

import {
    createResponse,
    parseJSON
} from './../util';

import {
    dispatchMail,
    sendMail,
    postMail
} from '../mailSvc';

import {
    constants
} from '../config/constants';
import { saveUnsubscribeDetail }  from './unsubscribe';

const elasticsearch = require('elasticsearch');
const client = new elasticsearch.Client({
    host: constants.ES_HOST,
    apiVersion: constants.ES_API_VERSION,
    connectionClass: HttpAmazonESConnector
});

const aws = require("aws-sdk");
const AthenaExpress = require("athena-express");
const athenaExpress = new AthenaExpress({
    aws
});
const athena = new aws.Athena();
const docClient = new aws.DynamoDB.DocumentClient();

const pushEvents: Handler = async (event: APIGatewayEvent, context: Context, cb: Callback) => {
    console.log("pushEvents INIT");
    try {
        let reqPayload;
        let d = event.body;
        if (!d) {
            return createResponse(400, 0, "No event body found", ' No event body found ');
        }
        var res = d.replace("data=", "");
        reqPayload = parseJSON(res);
        console.log("reqPayload - ", reqPayload);

        if (reqPayload.appname && isEventPep(reqPayload.appname)) {
            console.log('Pep v2 Event');
            if (reqPayload.channel) {
                let channel = formatChannelName(reqPayload.channel);
                reqPayload.channel = channel;
            }
            if (!reqPayload['metainfo']) {
                reqPayload['metainfo'] = {}
            }
            reqPayload['metainfo']['env'] = process.env.NODE_ENV != 'production' ? 'staging' : 'production';
            let temp = await pushEventToES(reqPayload);
            console.log('TEMP = ',JSON.stringify(temp));
            if (temp.err) {
                //await dispatchMail(esPushOp.error);
                return createResponse(500, 0, temp.err, ' error in pushing event data to elasticsearch ');
            }
            if(reqPayload.category == "unsubscribe" && reqPayload.action == "unsubscribe"){
                let unsubRes = await saveUnsubscribeDetail(reqPayload);
                if(unsubRes.error){
                    return createResponse(500, 0, temp.err, 'Data pushed to ES but failed in blocking');
                }
            } 
            return createResponse(200, 1, null, ' event successfully pushed to elasticsearch ');
        }

        let sqsPushRes = await pushEventToQueue(reqPayload);
        if (sqsPushRes.err) {
            await sendMail({
                content: sqsPushRes.err
            });
            return createResponse(500, 0, sqsPushRes.err.message, ' error in pushing event data to queue ');
        }
        return createResponse(200, 1, null, ' event successfully pushed to queue ');
    } catch (err) {
        console.log(`Unhandled err: ${JSON.stringify(err)}`)
        await sendMail({
            content: err
        });
        return createResponse(500, 0, err.message, ' error in pushing event data to queue ');
    }
}

const dataTransferToS3: Handler = async (event: any, context: Context, cb: Callback) => {
    console.log("***function gets is start execution for data transfer to s3 ******", event);
    console.log("eventData", JSON.stringify(event));
    try {
        let allRecords = [];
        // first we do a search, and specify a scroll timeout
        //event.labname
        // event.body = JSON.parse(event.body);
        var {
            _scroll_id,
            hits
        } = await fetchEventsFromES(event.labname);
      
        while (hits && hits.hits.length) {
            // Append all new hits
            allRecords.push(...hits.hits)
            console.log(`${allRecords.length} of ${hits.total}`)
            var {
                _scroll_id,
                hits
            } = await client.scroll({
                scrollId: _scroll_id,
                scroll: '10s'
            })
        }
        console.log(`Complete: ${allRecords.length} records retrieved`)

        if (!allRecords || !allRecords.length) {
         
            return createResponse(500, 0, allRecords, 'something went wrong');
        }
        let eventsData = allRecords;
        let ids = [];
        eventsData.map(data => (
            ids.push(data._id)
        ));
        console.log("event ids", ids);
        let s3Data = await uploadOnS3(eventsData);
        // console.log('uploaded s3Data', s3Data);
        if (s3Data.error) {
            console.log("error in to uploaf data on s3", s3Data.error);
            sendMail({
                'content': s3Data.error
            }, constants.emailId);
            return createResponse(500, 0, s3Data.error, 'something went wrong');
        }
        let backUpEvent = await migrateToProdEventBackupIndex(event.labname);
        if(backUpEvent.error){
            console.log("****error in to migrate events to other index ****\n ");
            sendMail({
                'content': backUpEvent.error
            }, constants.emailId);
            return createResponse(500, 0, backUpEvent.error, 'something went wrong');
        }
        console.log("start deletion function to execute");
        let batchSize = constants.ES_SIZE_LIMIT;
        console.time("chunkifyData");
        let newArr = chunkify(ids, batchSize);
        console.log("chunkify array", newArr);
        console.timeEnd("chunkifyData");
        for(let i=0; i<newArr.length; i++){
            console.log(`Processing batch - ${i+1} with ${newArr[i].length} events`);
            let requestData = {
                query: {
                    terms: {
                        _id: newArr[i]
                    }
                }
            }
            let deleteData =  await deleteEventsFromEs(requestData, getEsIndex());
            console.timeEnd("deleteData");
            if(deleteData.error){
                console.log("error in to delete data from elastic", deleteData.error);
                sendMail({
                    'content': deleteData.error
                }, constants.emailId);
                return;
            }
        }
        console.log("***successfully deleted *****");
        return;
    } catch (err) {
        console.log('err in the dataTransferToS3', err);
        sendMail({
            'content': err
        }, constants.emailId);
        return createResponse(500, 0, err, 'something went wrong');
    }
}

async function uploadOnS3(data) {
    try {
        let dic = {};
        console.log("data length", data.length);
        for (let i = 0; i < data.length; i++) {
            let events = data[i]._source;
            if (!events) {
                console.error('body not found')
                continue;
            }
            let messagebody = events;
            if (!messagebody.clientname || !messagebody.appname || !messagebody.domain || !messagebody.channel) {
                // check for appname domain channel if not available send error mail and continue
                let exceptionMsg = `
                    S3 Athena bucket name values missing in message - ${JSON.stringify(messagebody)}
                `
              
            }
            if (!messagebody.domain) {
                continue;
            }
            let domain = messagebody.domain.split('.')[0] == 'www' ? messagebody.domain.split('.')[1] : messagebody.domain.split('.')[0];
            let body = formatS3Data(messagebody);
            let key = `${messagebody.clientname}_${messagebody.appname}_${domain}_${messagebody.channel}`
            let keyParam = {
                clientname: messagebody.clientname,
                appname: messagebody.appname,
                domain: domain,
                channel: messagebody.channel
            }
            if (dic && dic.hasOwnProperty(key)) {
                dic[key].data = `${dic[key].data}\n ${JSON.stringify(body)}`;
            } else {
                dic[key] = {
                    data: `${JSON.stringify(body)}`,
                    key: generateS3Key(keyParam, messagebody.metainfo)
                }
            }
        }
        for (let key in dic) {
            await uploadOnS3Internal(dic[key].key, dic[key].data);
        }
        return {
            error: null,
            result: null
        }
    } catch (e) {
        console.log(e);
        return {
            error: e,
            result: null
        }
    }
}

async function uploadWhatsAppDataOnS3(data) {
    try {
        let dic = {}, dic1 = {};
        console.log("data length", data.length);
        for (let i = 0; i < data.length; i++) {
            let events = data[i]._source;
            if (!events) {
                console.error('body not found')
                continue;
            }
            let messagebody = events;
            if (!messagebody.labname) {
                // check for labname  if not available send error mail and continue
                let exceptionMsg = `
                    S3 Athena bucket name values missing in message - ${JSON.stringify(messagebody)}
                `
            }
            if(messagebody.env == 'production'){
                console.log("******data comes from production*****");
                let body = formatS3WhatsAppData(messagebody);
                let key = `${messagebody.labname}`
                let keyParam = {
                    labname: messagebody.labname
                   
                }
                if (dic && dic.hasOwnProperty(key)) {
                    dic[key].data = `${dic[key].data}\n ${JSON.stringify(body)}`;
                } else {
                    dic[key] = {
                        data: `${JSON.stringify(body)}`,
                        key: generateS3KeyForWhatsapp(keyParam, messagebody.env)
                    }
                } 
            }else{
                console.log("**********data not coming from production *****");
                let body1 = formatS3WhatsAppData(messagebody);
                let key1 = `${messagebody.labname}`
                let keyParam1 = {
                    labname: messagebody.labname
                   
                }
                if (dic1 && dic1.hasOwnProperty(key1)) {
                    dic1[key1].data = `${dic1[key1].data}\n ${JSON.stringify(body1)}`;
                } else {
                    dic1[key1] = {
                        data: `${JSON.stringify(body1)}`,
                        key1: generateS3KeyForWhatsapp(keyParam1, messagebody.env)
                    }
                } 
            }
        }
        for (let key in dic) {
            await uploadOnS3InternalForWhatsApp(dic[key].key, dic[key].data, 'thb-communications');
        }
        for (let key1 in dic1) {
            await uploadOnS3InternalForWhatsApp(dic1[key1].key1, dic1[key1].data, 'thb-communications-beta');
        }
        return {
            error: null,
            result: null
        }
    } catch (e) {
        console.log("error in the catch block", e);
        return {
            error: e,
            result: null
        }
    }
}


function formatS3Data(messageBody) {
    let hashStr = `${messageBody.userid ? messageBody.userid: ''}_${messageBody.action ? messageBody.action : ''}_${new Date().getTime()}_${messageBody.contentid ? messageBody.contentid : ''}`
    let hash = objectHash.MD5(hashStr);
    let obj = {
        category: messageBody.category,
        action: messageBody.action,
        label: messageBody.label || null,
        value: messageBody.value || null,
        html_component: messageBody.html_component || null,
        userid: messageBody.userid || null,
        contentid: messageBody.contentid || null,
        ssnstr: messageBody.ssnstr || null,
        timestamp: messageBody.timestamp || null,
        dispatchtime: messageBody.dispatchtime || null,
        dryrun: messageBody.dryrun || false,
        source: messageBody.source || null,
        cid: messageBody.cid || null,
        domain: messageBody.domain || null,
        landingpage: messageBody.landingpage || null,
        metainfo: messageBody.metainfo || null,
        useragent: messageBody.useragent || null,
        remoteaddress: messageBody.remoteaddress || null,
        createddate: messageBody.createddate || null,
        hash: hash,
        mobile: messageBody.mobile || null
    }
    if (messageBody.redirected) {
        obj['metainfo']['redirected'] = messageBody.redirected;
    }
    return obj;
}

function formatS3WhatsAppData(messageBody) {
    let obj = {
        tag: messageBody.tag,
        category: messageBody.category,
        mobile: messageBody.mobile || null,
        message: messageBody.message || null,
        meta_data: messageBody.meta_data || null,
        requestEpoch: messageBody.requestEpoch || null,
        createddate: messageBody.createddate || null,
        env: messageBody.env || null
      
    }
    return obj;
}


const labFetchingData: Handler = async (event: APIGatewayEvent, context: Context, callback: Callback) => {
    try {
        console.log('function start execution to fetch lab data');
        let temp = await getV2LiveLabs();
        if (temp.error) {
            callback(null, event);
            return;
        }
        let liveLabs: string[] = temp.result;
        if (!liveLabs || !liveLabs.length) {
            callback(null, event);
            return;
        }
        for (let i = 0; i < liveLabs.length; i++) {
            let lebResult = await invokeLambda(liveLabs[i]);
            if (lebResult.err) {
                console.log("ERROR FOUND");
                sendMail({
                    'content': lebResult.err
                }, constants.emailId);
            }
        }
    } catch (e) {
        console.log("error found", e);
        sendMail({
            'content': e
        }, constants.emailId);
    }
}


const labData: Handler = async (event: APIGatewayEvent, context: Context, callback: Callback) => {
    try {
        console.log('function start execution to fetch lab data');
        let temp = await getV2LiveLabs();
        if (temp.error) {
            callback(null, event);
            return;
        }
        let liveLabs: string[] = temp.result;
        if (!liveLabs || !liveLabs.length) {
            callback(null, event);
            return;
        }
        let funName;
        funName = (process.env.NODE_ENV == 'production')? 'capture-events-production-whatsappDataTransferToS3': 'capture-events-dev-whatsappDataTransferToS3';

        for (let i = 0; i < liveLabs.length; i++) {
            let lebResult = await callAnotherLambda(liveLabs[i], funName);
            if (lebResult.err) {
                console.log("ERROR FOUND");
                sendMail({
                    'content': lebResult.err
                }, constants.emailId);
            }
        }
    } catch (e) {
        console.log("error found", e);
        sendMail({
            'content': e
        }, constants.emailId);
    }
}

const whatsappDataTransferToS3: Handler = async (event: any, context: Context, cb: Callback) => {
    console.log("***function gets is start execution for data transfer to s3 ******", event);
    console.log("eventData", JSON.stringify(event));
    try {
        let payload = {
            index : getWhatsAppEsIndex(),
            body : {
                "query": {
                    "query_string": {
                        "default_field": "labname",
                        "query": event.labname
                    }
                }
            }   
        }
        let allRecords = [];
        var {
            _scroll_id,
            hits
        } = await fetchDataFromES(payload);
        while (hits && hits.hits.length) {
            // Append all new hits
            allRecords.push(...hits.hits)
            console.log(`${allRecords.length} of ${hits.total}`)
            var {
                _scroll_id,
                hits
            } = await client.scroll({
                scrollId: _scroll_id,
                scroll: '10s'
            })
        }
        console.log(`Complete: ${allRecords.length} records retrieved`)

        if (!allRecords || !allRecords.length) {
            // sendMail({
            //     'content': 'No records found of this lab' + event.labname
            // }, constants.emailId);
            return createResponse(500, 0, allRecords, 'something went wrong');
            // return createResponse(500, 0, esData.error, ' error in fetching events data from elasticsearch ');
        }
        let eventsData = allRecords;
        let ids = [];
        eventsData.map(data => (
            ids.push(data._id)
        ));
        console.log("event ids", ids);
        let s3Data = await uploadWhatsAppDataOnS3(eventsData);
        // console.log('uploaded s3Data', s3Data);
        if (s3Data.error) {
            console.log("error in to uploaf data on s3", s3Data.error);
            sendMail({
                'content': s3Data.error
            }, constants.emailId);
            return createResponse(500, 0, s3Data.error, 'something went wrong');
        }
        let input  = {
            labname : event.labname,
            srcIndex : getWhatsAppEsIndex(),
            destinationIndex : constants.ES_WHAtSAPP_INDEX_BACKUP_PROD

        }
        let backUpEvent = await migrateEsDataForBackup(input);
        if(backUpEvent.error){
            console.log("****error in to migrate events to other index ****\n ");
            sendMail({
                'content': backUpEvent.error
            }, constants.emailId);
            return createResponse(500, 0, backUpEvent.error, 'something went wrong');
        }
        console.log("start deletion function to execute");
        let batchSize = constants.ES_SIZE_LIMIT;
        console.time("chunkifyData");
        let newArr = chunkify(ids, batchSize);
        console.log("chunkify array", newArr);
        console.timeEnd("chunkifyData");
        for(let i=0; i<newArr.length; i++){
            console.log(`Processing batch - ${i+1} with ${newArr[i].length} events`);
            let requestData = {
                query: {
                    terms: {
                        _id: newArr[i]
                    }
                }
            }
            let deleteData =  await deleteEventsFromEs(requestData, getWhatsAppEsIndex());
            console.timeEnd("deleteData");
            if(deleteData.error){
                console.log("error in to delete data from elastic", deleteData.error);
                sendMail({
                    'content': deleteData.error
                }, constants.emailId);
                return;
            }
        }
        console.log("***successfully deleted *****");
        return;
    } catch (err) {
        console.log('err in the dataTransferToS3', err);
        sendMail({
            'content': err
        }, constants.emailId);
        return createResponse(500, 0, err, 'something went wrong');
        // return createResponse(500, 0, err, ' error in dataTransferToS3 ');
    }
}

const getAggregatedDataFromES: Handler = async (event: any, context: Context, cb: Callback) => {
    try {
        // console.log(`Event: ${JSON.stringify(event)}`);
        let postData = event.body;
        postData = postData ? parseJSON(postData) : null;
        let labName: string = postData && postData.labname ? postData.labname : null;
        let aggregatedColumns: string[] = isProduction() ? constants.aggColumnsProd : constants.aggColumns;
        if (postData && postData.columns && postData.columns.length) {
            aggregatedColumns = postData.columns;
        }
        let queryPayload: any = {
            aggs: {}
        }
        if (!labName) {
            return createResponse(200, 1, null, ' labname is required ');
        }
        let domainArray: string[] = isProduction() ? ['articles.hlthclub.in', 'a.hlthclub.in', 'patientportal.hlthclub.in'] : ['sarticles.hlthclub.in', 'sa.hlthclub.in'];
        if (labName) {
            queryPayload['query'] = {
                bool: {
                    must: [{
                        term: {
                            clientname: labName
                        }
                    }, {
                        terms: {
                            domain: domainArray
                        }
                    }]
                }
            }
        }
        for (let aggColumn of aggregatedColumns) {
            if (aggColumn == 'createddate') {
                queryPayload['aggs'][aggColumn] = {
                    date_histogram: {
                        field: aggColumn,
                        interval: 'day',
                        format: 'yyyy-MM-dd'
                    }
                }
                continue;
            }
            queryPayload['aggs'][aggColumn] = {
                terms: {
                    field: aggColumn,
                    size: 100
                }
            }
        }
        let temp = await searchES(queryPayload);
        let result = temp.aggregations || {};
        let resultObj = {};
        for (let key in result) {
            resultObj[key] = {};
            let buckets: any[] = result[key].buckets;
            for (let bucket of buckets) {
                let temp_key: string = (key == 'createddate') ? 'key_as_string' : 'key';
                let dataKey: string = bucket[temp_key];
                resultObj[key][dataKey] = parseInt(bucket.doc_count);
            }
        }

        let athenaResult = await getDataFromAthenaInternal(event);
        let athenaData = athenaResult.result;
        for (let columnName in athenaData) {
            if (!resultObj[columnName]) {
                resultObj[columnName] = {};
            }
            let columnWiseData = athenaData[columnName] || {};
            for (let key in columnWiseData) {
                if (!resultObj[columnName][key]) {
                    resultObj[columnName][key] = parseInt(columnWiseData[key]);
                } else {
                    resultObj[columnName][key] = parseInt(resultObj[columnName][key]) + parseInt(columnWiseData[key]);
                }
            }
        }
        return createResponse(200, 1, resultObj, ' events successfully fetched');
    } catch (err) {
        return createResponse(500, 0, err.message, ' error in fetching events');
    }
}

const getDataFromEthena: Handler = async (event: any, context: Context, cb: Callback) => {
    let temp = await getDataFromAthenaInternal(event);
    return createResponse(temp.code, temp.status, temp.result, temp.message);
}

async function getDataFromAthenaInternal(event: any) {
    console.log(`Request Data = ${JSON.stringify(event)}`);
    let postData = event.body;
    postData = postData ? parseJSON(postData) : null;
    let aggregatedColumns: string[] = isProduction() ? constants.aggColumnsProd : constants.aggColumns;
    if (postData && postData.columns && postData.columns.length) {
        aggregatedColumns = postData.columns;
    }
    try {
        let database: string = getDatabase();
        if(!postData || !postData.labname){
            return {
                error: true,
                code : 500,
                status: 0,
                message: 'labname is required',
                result: {}
            }
        }
        let query: string = getAggregateDataFromEthena(aggregatedColumns, postData.labname, database);
        let cacheKey: string = generateCacheKey(query, postData);
        let cacheResult = await getCachedqueryId(cacheKey);
        if (cacheResult.result) {
            console.log("cache exist");
            let athenaResult =  await getFormattedQueryResultData(cacheResult.result);
            return generateResponse(athenaResult);
        }
        console.log("cache not found");
        let startQueryOp = await startQueryExecution(query);
        let queryId: string = startQueryOp.QueryExecutionId;
        console.log("queryId", queryId);
        let updateCache = await updateCacheKeyForNewQuery(query, cacheKey, queryId);
        console.log('updateCache', updateCache);
        if(!updateCache.status){
            return { error: true,
                code : 500,
                status: 0,
                message: updateCache.error,
                result: {}
            }
        }
        await sleep(10000);
        let athenaResult =  await getFormattedQueryResultData(queryId);
        return generateResponse(athenaResult);
       
    } catch (err) {
        console.log('errr1', err);
        return {
            error: true,
            code : 500,
            status: 0,
            message: err,
            result: {}
        }
    }
}

export async function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}


export async function updateCacheKeyForNewQuery(queryFilter, cachekey, queryResponse) {
    let response = { "status": 0, "data": {}, "error": "" };
    let ttlInHoursConst = constants.ttlInHoursConst;
    var params = {
        TableName: constants.cache_table,
        Item: {
            "cachekey": cachekey,
            "scope": 'events',
            "createdtime": (new Date).getTime(),
            "ttl": getTTLForDuration(ttlInHoursConst),
            'baseQuery':   queryResponse != undefined? queryResponse : '',     
            'query':queryFilter
        }
    };
    try {
        const data = await docClient.put(params).promise();
        console.log("Added query:", JSON.stringify(data, null, 2));
        response.status = 1;
        response.data = data;
    } catch (err) {
        console.error("Unable to add queryID(COMM). Error JSON:", JSON.stringify(err, null, 2));
        response.status = 0;
        response.error = err;
    }
    return response;
}

export async function startQueryExecution(query: string, database: string = constants.prodLiveDb) {
    let params = {
        QueryString: query,
        ResultConfiguration: {
            OutputLocation: constants.athenaOutputDirectory,
            EncryptionConfiguration: {
                EncryptionOption: constants.encryptionOption
            }
        },
        QueryExecutionContext: {
            Database: database
        }
    }
    return new Promise < {
        error: any;
        QueryExecutionId: any;
    } > ((resolve, reject) => {
        athena.startQueryExecution(params, (err, data) => {
            if (err) {
                console.error(`Failed to create query execution id. Error JSON:  ${JSON.stringify(err)}`);
                resolve({
                    error: err,
                    QueryExecutionId: data.QueryExecutionId
                });
                return;
            }
            console.log(`Query executed successfully. QueryExecutionId: ${data.QueryExecutionId}`);
            resolve({
                error: err,
                QueryExecutionId: data.QueryExecutionId
            });
        });
    });
}

function generateResponse(athenaResult){
    let rows = athenaResult.result.data;
    if (!rows) {
        console.log("****No data found *****", rows);
        return {
            error: true,
            code: 500,
            status: 0,
            message: 'No data found from s3',
            result: {}
        }
    }
    let result = rows.reduce((r, {
        type,
        key,
        count
    }) => {
        r[type] = r[type] || {}
        r[type][key] = r[type][key] || 0
        r[type][key] += count
        return r;
    }, {});
    return {
        error: null,
        code: 200,
        status: 1,
        message: 'events successfully fetched from s3',
        result
    }
}

async function getFormattedQueryResultData(queryId: string) {
    let queryResultOp = await getQueryResults(queryId);
    let queryResult = queryResultOp.result;
    let rows = formatAthenaDataOutput(queryResult);
    return {
        err: null,
        result: {
            data: rows,
        }
    }
}

export function getDatabase(): string {
    if (isProduction()) {
        return constants.betaDb;
    }
    return constants.betaDb;
}

export function chunkify(arr, batchSize) {
    if (arr.length < batchSize)
        return [arr];
    let out = [];
    while(arr.length>=batchSize){
        let slicedArr = arr.splice(0, batchSize);
        out.push(slicedArr);
    }
    if(arr.length>1){
        out.push(arr);
    }
    return out;
}

function generateCacheKey(query: string, postData : any): string {
    var str: any = JSON.stringify(postData);
    // sorting
    str = str.split("");
    str = str.sort();
    str = str.sort(case_insensitive_comp)
    // concatenate the chunks in one string
    str = str.join("");
    return str;

}
function case_insensitive_comp(strA, strB) {
    return strA.toLowerCase().localeCompare(strB.toLowerCase());
}

async function getCachedqueryId(cacheKey: string) {
    let params = {
        TableName: constants.cache_table,
        Key: {
            cachekey: cacheKey
        }
    }
    let temp = await getItem(params);
    let result = temp.result;
    if (!result) {
        return {
            error: null,
            result: null
        }
    }
    return {
        error: null,
        result: result.baseQuery
    }
}
function formatAthenaDataOutput(athenaOutput: any) {
    let formattedOutput = [];
    if (!athenaOutput || !athenaOutput.ResultSet || !athenaOutput.ResultSet.Rows || !athenaOutput.ResultSet.Rows.length) {
        return null;
    }
    let rows: any[] = athenaOutput.ResultSet.Rows;
    let columnHeaderArray: string[] = [];
    let rawColumnHeaderArray: any[] = rows[0].Data;
    for (let rawColumnHeaderRow of rawColumnHeaderArray) {
        for (let key in rawColumnHeaderRow) {
            columnHeaderArray.push(rawColumnHeaderRow[key]);
        }
    }
    for (let i = 1; i < rows.length; i++) {
        let row = rows[i].Data;
        let formattedRow = {};
        for (let j = 0; j < row.length; j++) {
            let columnObj = row[j];
            for (let key in columnObj) {
                formattedRow[columnHeaderArray[j]] = columnObj[key] || null
            }
        }
        formattedOutput.push(formattedRow);
    }
    return formattedOutput;
}

const deleteEventsFromBackupES: Handler = async (event: any, context: Context, cb: Callback) => {
    console.log("****delete data from ethena *****\n");
    let requestData = {
        query: {
            "range" : {
                'createddate' : {"lte": "now-4d/d"}
            }
        }
    }
    let temp = await deleteEventsFromEs(requestData, 'ES_EVENT_INDEX_BACKUP_PROD');
    if(temp.error){
        console.log("ERROR FOUND");
        sendMail({
            'content': temp.err
        }, constants.emailId);
    }
    return createResponse(temp.code, temp.status, temp.result, temp.message);
}

export async function getQueryResults(queryid: string) {
    try {
        let params = {
            QueryExecutionId: queryid
        }
        
        let data = await athena.getQueryResults(params).promise();
        return {
            error: null,
            result: data
        }
    } catch (e) {
        console.log(e);
        return {
            error: e,
            result: null
        }
    }
}
export function getTTLForDuration(hours: number) {
    let epocTTL = new Date().setTime(new Date().getTime() + (hours * 60 * 60 * 1000));
    return Math.floor(epocTTL / 1000);

}

const migrateEvents: Handler = async (event: APIGatewayEvent, context: Context, cb: Callback) => {
    console.log('***migrateEvents ****');
    let temp: {
        error: any;
        result: any;
        message ? : string;
    } = await executeStepFunction({
        name: `${constants.eventDailyMigrationPipelineName}-${new Date().getTime()}`,
        stateMachineArn: constants.eventDailyMigrationPipelineArn,
    });
    event['executionArn'] = temp.result && temp.result.executionArn ? temp.result.executionArn : null;
    cb(null, event);
}


const createIndex: Handler = async (event: any, context: Context, cb: Callback) => {
    console.log("*****createIndex function start execution *******\n");
    let reqPayload;
    let d = JSON.parse(event.body);
    let temp  = await generateIndex(d.indexName);
    console.log('temp', temp);
    if(temp.error){
        return createResponse(500, 0, temp.result, 'something went wrong');
    }
    return createResponse(200, 1, temp.result, 'successfully created');
}

const migrateEs: Handler = async (event: any, context: Context, cb: Callback) => {
    console.log("*****migrateEs function start execution *******\n");
    let reqPayload;
    let d = JSON.parse(event.body);
    let input = {
        srcIndex : d.srcIndex,
        labname : d.labname,
        destinationIndex : d.destinationIndex
    }
    console.log('input data', input);
    let temp  = await migrateEsDataForBackup(input);
    console.log('temp', temp);
    if(temp.error){
        return createResponse(500, 0, temp.result, 'something went wrong');
    }
    return createResponse(200, 1, temp.result, 'successfully created');
}
const deleteDataFromES: Handler = async (event: any, context: Context, cb: Callback) => {
    console.log("*****deleteDataFromES function start execution *******\n");
    let reqPayload;
    let d = JSON.parse(event.body);
    console.log("d value", d);
    let requestData = {
        query: {
            terms: {
                _id: d.ids
            }
        }
    }
    console.log('input data', requestData);
    let temp  = await deleteEventsFromEs(requestData, d.indexName);
    console.log('temp', temp);
    if(temp.error){
        return createResponse(500, 0, temp.result, 'something went wrong');
    }
    return createResponse(200, 1, temp.result, 'successfully created');
}



const migrateWhatsAppEvents: Handler = async (event: APIGatewayEvent, context: Context, cb: Callback) => {
    console.log('***migrateEvents ****');
    let temp: {
        error: any;
        result: any;
        message ? : string;
    } = await executeStepFunction({
        name: `${constants.whatsAppEventDailyMigrationPipelineName}-${new Date().getTime()}`,
        stateMachineArn: constants.whatsAppEventDailyMigrationPipelineArn,
    });
    event['executionArn'] = temp.result && temp.result.executionArn ? temp.result.executionArn : null;
    cb(null, event);
}

const eventsTransferToS3: Handler = async (event: any, context: Context, cb: Callback) => {
    console.log("***function gets is start execution for data transfer to s3 ******", event);
    console.log("eventData", JSON.stringify(event));
    try {
        let allRecords = [];
        var {
            _scroll_id,
            hits
        } = await fetchEventsFromES(event.labname);
        while (hits && hits.hits.length) {
            // Append all new hits
            allRecords.push(...hits.hits)
            console.log(`${allRecords.length} of ${hits.total}`)
            var {
                _scroll_id,
                hits
            } = await client.scroll({
                scrollId: _scroll_id,
                scroll: '10s'
            })
        }
        console.log(`Complete: ${allRecords.length} records retrieved`)

        if (!allRecords || !allRecords.length) {
            return createResponse(500, 0, allRecords, 'something went wrong');
        }
        let eventsData = allRecords;
        let ids = [];
        eventsData.map(data => (
            ids.push(data._id)
        ));
        console.log("event ids", ids);
        let s3Data = await uploadOnS3(eventsData);
        if (s3Data.error) {
            console.log("error in to upload data on s3", s3Data.error);
            let payload = {
                'httpMethod' :'POST',
                'path' : 'Error in to upload data on s3',
                'error': s3Data.error
            }
            await postMail(payload)        

            // sendMail({
            //     'content': s3Data.error
            // }, constants.emailId);
            return createResponse(500, 0, s3Data.error, 'something went wrong');
        }
        let backUpEvent = await migrateToProdEventBackupIndex(event.labname);
        if(backUpEvent.error){
            console.log("****error in to migrate events to other index ****\n ");
            let payload = {
                'httpMethod' :'POST',
                'path' : 'Error in to migrate events to other index for the backup',
                'error': s3Data.error
            }
            await postMail(payload) 

            // sendMail({
            //     'content': backUpEvent.error
            // }, constants.emailId);
            return createResponse(500, 0, backUpEvent.error, 'something went wrong');
        }
        console.log("start deletion function to execute");
        let batchSize = constants.ES_SIZE_LIMIT;
        console.time("chunkifyData");
        let newArr = chunkify(ids, batchSize);
        console.log("chunkify array", newArr);
        console.timeEnd("chunkifyData");
        for(let i=0; i<newArr.length; i++){
            console.log(`Processing batch - ${i+1} with ${newArr[i].length} events`);
            let requestData = {
                query: {
                    terms: {
                        _id: newArr[i]
                    }
                }
            }
            let deleteData =  await deleteEventsFromEs(requestData, getEsIndex());
            console.timeEnd("deleteData");
            if(deleteData.error){
                console.log("error in to delete data from elastic", deleteData.error);
                let payload = {
                    'httpMethod' :'POST',
                    'path' : 'Error in to delete data from elastic',
                    'error': s3Data.error
                }
                await postMail(payload) 

                // sendMail({
                //     'content': deleteData.error
                // }, constants.emailId);
                return;
            }
        }
        console.log("***successfully deleted *****");
        let payload = {
            'httpMethod' :'POST',
            'path' : 'Event migration',
            'success': 'successfully events migration'
        }
        await postMail(payload)  

        return;
    } catch (err) {
        console.log('err in the dataTransferToS3', err);
        let payload = {
            'httpMethod' :'POST',
            'path' : 'Error in to dataTransferToS3',
            'error' : err
        }
        await postMail(payload) 

        // sendMail({
        //     'content': err
        // }, constants.emailId);
        return createResponse(500, 0, err, 'something went wrong');
        // return createResponse(500, 0, err, ' error in dataTransferToS3 ');
    }
}

const eventMigrationData: Handler = async (event: APIGatewayEvent, context: Context, callback: Callback) => {
    try {
        console.log('function start execution to fetch event lab data');
        let temp = await getEventsLiveLabs();
        if (temp.error) {
            callback(null, event);
            return;
        }
        let liveLabs: string[] = temp.result;
        if (!liveLabs || !liveLabs.length) {
            callback(null, event);
            return;
        }

        let funName;
        funName = (process.env.NODE_ENV == 'production')? 'capture-events-production-eventsTransferToS3': 'capture-events-dev-eventsTransferToS3';

        for (let i = 0; i < liveLabs.length; i++) {
            let lebResult = await callAnotherLambda(liveLabs[i], funName);
            if (lebResult.err) {
                console.log("ERROR FOUND");
                let payload = {
                    'httpMethod' :'POST',
                    'path' : 'Triggered lambda to fetch the lab data',
                    'error': lebResult.err
                }
                await postMail(payload)                    
            }
        }
        
    } catch (e) {
        console.log("error found", e);
        let payload = {
            'httpMethod' :'POST',
            'path' : 'Triggered lambda to fetch the lab data',
            'error': e
        }
        await postMail(payload)   
        
    }
}


const dailyEventsMigration: Handler = async (event: APIGatewayEvent, context: Context, cb: Callback) => {
    console.log('***migrateEvents ****');
    let temp: {
        error: any;
        result: any;
        message ? : string;
    } = await executeStepFunction({
        name: `${constants.eventsMigrationPipelineName}-${new Date().getTime()}`,
        stateMachineArn: constants.dmrEventsDailyMigrationPipelineArn,
    });
    event['executionArn'] = temp.result && temp.result.executionArn ? temp.result.executionArn : null;
    cb(null, event);
}


const getCampaignList: Handler = async (event, context, cb) => {
    let postData: any = event.body;
    postData = postData ? parseJSON(postData) : null;
    let response: any;

    console.log("postData", postData);

    if(!postData || !postData.labName || !postData.channel) {
        response = createResponse(400, 0, '', 'Required field is missing');
        return response;
    }

    if(!['sms', 'email', 'whatsapp'].includes(postData.channel)){
        response = createResponse(400, 0, '', 'Channel field is invalid');
        return response;
    }
    if(postData.commType){
        if(!['pc', 'pl', 're'].includes(postData.commType)){
            response = createResponse(400, 0, '', 'commType field is invalid');
            return response;
        }
    }
    let desboardPayloadData = {
        "labName": postData.labName,
        'channel' : postData.channel
    }
    if(postData.commType){
        desboardPayloadData['commType'] = postData.commType;
    }
    try {
        let query: string =  campaignListQuery(desboardPayloadData);
        console.log("query11", query);
        if(query){
            let temp = await getRowsFromAthena(query);
            let rows = temp.result;
            // console.log('rows Data', rows);
           
            response = createResponse(200, 1, rows, 'successfully fetch data');
        }else{
            response = createResponse(200, 0, [], 'no result found');
        }
    } catch (e) {
        console.log(e);
        response = createResponse(200, 0, e, 'something went wrong');
    }
    return response;
    
}


const getDownloadData: Handler = async (event, context, cb) => {
    console.log(`payload Data : ${JSON.stringify(event)}`);
    let postData : any =  event.body;
    let response;

    postData = postData ? parseJSON(postData) : null;
    console.log("postData= ", postData);

    if(!postData || !postData.labName || !postData.channel  || !postData.email){
        response = createResponse(400, 0, '', 'Required field is missing');
        return response;
    }
    if(!['sms', 'email', 'whatsapp'].includes(postData.channel)){
        response = createResponse(400, 0, '', 'Channel field is invalid');
        return response;
    }
    if(postData.commType){
        console.log("INDISE");
        if(!['pc', 'pl', 're'].includes(postData.commType)){
            response = createResponse(400, 0, '', 'commType field is invalid');
            return response;
        }
    }
    
    let paylod = {
        'labName':  postData.labName,
        'channel' : postData.channel
    }
    if(postData.campid && postData.campid.length){
        paylod["campid"]  = postData.campid;
    }
    console.log("before postData", postData);  

    if(postData.commType){
        paylod['commType'] = postData.commType;
    }
    if(postData["campName"]){
        paylod['campName'] = postData.campName;
    }
    
    let queryBuildup =  getDownloadQuery(postData);
    console.log("****queryBuildup****", queryBuildup);
    
    let SMS_SCOPE = "DS";

    try {
        var payload:any = JSON.parse(event.body);
        let obj = clone(payload);
        delete obj.email
        let cacheKey = await generateCacheKeyForSendData(obj, SMS_SCOPE);
        console.log("cacheKey11", cacheKey);
        let cacheHitObj = await checkForCacheHitQB(cacheKey);
        console.log("cacheHitObj", cacheHitObj);
        //payload.dcache = payload.dcache ? payload.dcache : 1;
        if (cacheHitObj.status == 1) {
            let responseJSON = {
                "cache": true,
                "QueryExecutionId": cacheHitObj.baseQuery
            }
            let new_payload = {
                key: "DOWNLOAD-REQUESTS" + "/date=" + getNowDate() + "/labname=" + payload.labname + "/email=" + cacheHitObj["email"] + "/" + cacheHitObj.baseQuery + ".csv",
                email: payload.email,
                labname: payload.labname,
                isCachedData: true
            }
            let params = {
                FunctionName: constants.getRoiSheetLambda(),
                Payload: JSON.stringify(new_payload)
            };
            let res:any = await invokeTriggerLambda(params)
            console.log("res111", res);
            if (res.err) {
                responseJSON['message'] = " ERROR IN INVOKING LAMBDA ";
                response = createResponse(500, 0, responseJSON, "success");
                return response;
            }
            response = createResponse(200, 1, responseJSON, "success");
            return response;
        }
        var query = queryBuildup;
        if (payload && query) {
            let outputLocation = "s3://" + constants.getAthenaQueryExecutionsBucket() + "/DOWNLOAD-REQUESTS" + "/date=" + getNowDate() + "/labname=" + payload.labName + "/email=" + payload.email;

            var params = {
                QueryString: query, /* required */
                ResultConfiguration: { /* required */
                    OutputLocation: outputLocation, /* required */
                },
                QueryExecutionContext: {
                    Database: constants.database()
                }
            };
            const data = await athena.startQueryExecution(params).promise();
            console.log("line 304", data);
            await updateCacheKeyForNewDataQuery(cacheKey, data.QueryExecutionId, query, SMS_SCOPE);
            data.cache = false;
            response = createResponse(200, 1, data, data);
        }
    }
    catch (e) {
        console.log(e);
        response = createResponse(500, 0, null, e.message);
    }
    //callback(undefined, response);
    return response;


}



const getStats: Handler = async (event, context, cb) => {
    console.log('function getStats start execution');
    let payload ;

    let postData : any = event.body;
    let response;

    payload = postData ? parseJSON(postData) : null;
    console.log("postData= ", payload);


    let reqData: any = {
        query: {
            bool: {
                filter: [{
                    match: {
                        clientname: payload.labname
                    }
                }]
            }
        }
    }
   
    if (payload.dateFrom || payload.dateTo) {
        let temp = {
            range: {
                createddate: {}
            }
        }
        if (payload.dateFrom) {
            temp['range']['createddate']['gte'] = `${payload.dateFrom}T00:00:00`;
        }
        if (payload.dateTo) {
            temp['range']['createddate']['lte'] = `${payload.dateFrom}T23:59:59.999`;
        }
        reqData['query']['bool']['filter'].push(temp);
    }

    try {
        let allRecords = [];
        var {
            _scroll_id,
            hits
            
        } = await fetchDataFromES(reqData);
        while (hits && hits.hits.length) {
            // Append all new hits
            allRecords.push(...hits.hits)
            console.log(`${allRecords.length} of ${hits.total}`)
            var {
                _scroll_id,
                hits
            } = await client.scroll({
                scrollId: _scroll_id,
                scroll: '10s'
            })
        }
        console.log(`Complete: ${allRecords.length} records retrieved`)

        if (!allRecords || !allRecords.length) {
            return createResponse(500, 0, allRecords, 'something went wrong');
        }
        return createResponse(500, 0, allRecords, 'fetch data');
   
    }
    catch(e){
        return createResponse(500, 0, e, 'something went wrong');
    }
}


const addBitlink: Handler = async (event: any, context: Context, callback: Callback) => {
    try {
        console.log('function start execution to addBitlink  data', event.body);
        let input = JSON.parse(event.body);
        console.log("input data", input);
        console.log('data',  input.data);
        let data = input.data ? input.data : [];
        if (!data || !data.length) {
            console.log("inside");
            callback(null, event);
            return;
        }
       
        let funName;
        funName = (process.env.NODE_ENV == 'production')? 'capture-events-production-bitlinkBatchWrite': 'capture-events-dev-bitlinkBatchWrite';
        console.log("funName triggered", funName);
        let res = await callAnotherLambda(data, funName);
        if (res.err) {
            console.log("ERROR FOUND");
            sendMail({
                'content': res.err
            }, constants.emailId);
            return;
        }
        return createResponse(200, 1, [], 'successfully saved data');
      
    } catch (e) {
        console.log("error found", e);
        sendMail({
            'content': e
        }, constants.emailId);
        return createResponse(500, 0, e, 'something went wrong');
    }
}


const bitlinkBatchWrite: Handler = async (event: any, context: Context, cb: Callback) => {
    console.log("***function gets is start bitlinkBatchWrite  ******", event);
    console.log("eventData", JSON.stringify(event));
    let data = event.labname;
    try {
        for (let i = 0; i < data.length; i = i + 24) {
            var tempArray = data.slice(i, i + 24);
            var batchRequest = {
                RequestItems: {
                    [constants.bitlinkDB()]: []
                }
            };
            let epoch = getEPOCHSeconds();
            for (let j = 0; j < tempArray.length; j++) {
                batchRequest.RequestItems[constants.bitlinkDB()].push({
                    PutRequest: {
                        Item: {
                            'bithash': tempArray[j]['bithash'],
                            'bitsortkey': tempArray[j]['bitsortkey'],
                            'createddate': epoch,
                            'identifier': tempArray[j]['identifier'],
                            'personal_info': tempArray[j]['personal_info'],
                            'ttl': (epoch + constants.ttlValue()),
                            'updateddate': epoch,
                            'url': tempArray[j]['url']
                        }
                    }
                })
            }
            // console.log("batchRequest", batchRequest);
            let batchRes = await batchWriteData(batchRequest);
            if (batchRes.err) {
                console.log(batchRes.err);
                console.log(batchRes.err.stack);
                console.error("Unable to get bitlink data. Error JSON:", JSON.stringify(batchRes.err, null, 2));
                return batchRes;
            }
        }
        return;
    } catch (err) {
        console.log('err in write the data', err);
        sendMail({
            'content': err
        }, constants.emailId);
        return createResponse(500, 0, err, 'something went wrong');
    }
}

export {
    pushEvents,
    dataTransferToS3,
    labFetchingData,
    getAggregatedDataFromES,
    getDataFromEthena,
    deleteEventsFromBackupES,
    migrateEvents,
    labData,
    whatsappDataTransferToS3,
    createIndex,
    migrateWhatsAppEvents,
    migrateEs,
    deleteDataFromES,
    eventMigrationData,
    eventsTransferToS3,
    dailyEventsMigration,
    getCampaignList,
    getDownloadData,
    getStats,
    addBitlink,
    bitlinkBatchWrite
  
}