import momenttz = require("moment-timezone");
import moment = require('moment');
import zlib = require('zlib');

const HttpAmazonESConnector = require('./esconnector');
import {
    ISendMessageAttributeList
} from './../modules/queue/interface/index';

import {
    pushMessage
} from './../modules/queue';

import {
    getQueueUrl
} from './../util/queueHandler';

import {
    dispatchMail,
    sendMail
} from '../mailSvc';

import {
    constants
} from '../config/constants';

var AWS = require('aws-sdk');

const docClient = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda({
    region: 'ap-south-1'
});
const s3 = new AWS.S3({
    region: 'ap-south-1'
});
const stepFunctions = new AWS.StepFunctions();

let elasticsearch = require('elasticsearch');

let client = new elasticsearch.Client({
    host: constants.ES_HOST,
    apiVersion: constants.ES_API_VERSION,
    connectionClass: HttpAmazonESConnector
});
const AthenaExpress = require("athena-express");

const athenaExpress = new AthenaExpress({
    aws: AWS
});


export async function pushEventToQueue(eventData) {
    console.log("pushEventToQueue INIT");
    let data: ISendMessageAttributeList = {
        MessageBody: JSON.stringify(eventData),
        QueueUrl: getQueueUrl()
    }
    return pushMessage(data);
}

export async function pushEventToES(payload: any) {
    console.log(`Going PUSH EVENT TO ES, Payload: ${JSON.stringify(payload)}`);
    let temp = await client.index({
        index: getEsIndex(),
        body: payload
    })
    console.log('pushEventToES END = ',JSON.stringify(temp));
    return temp;
}

export async function fetchEventsFromES(payload: any) {
    let {
        _scroll_id,
        hits
    } = await client.search({
        index: getEsIndex(),
        type: '_doc',
        scroll: '10s',
        size: 10000,
        "body": {
            "query": {
                "query_string": {
                    "default_field": "clientname",
                    "query": payload
                }
            }
        }   
        
    })
    return {
        _scroll_id,
        hits
    };
   

}

export async function searchES(payload: any) {
    console.log(`Going TO Search ON ES, Payload: ${JSON.stringify(payload)}`);
    let temp = await client.search({
        index: getEsIndex(),
        body: payload
    })
    console.log(JSON.stringify(temp));
    return temp;
}

export async function fetchDataFromES(payload: any) {
    let {
        _scroll_id,
        hits
    } = await client.search({
        index: payload.index,
        type: '_doc',
        scroll: '10s',
        size: 10000,
        "body": payload.body
    })
    return {
        _scroll_id,
        hits
    };
}

export async function deleteEventsFromEs(payload, indexName) {
    var deleteData = client.deleteByQuery({
        index: indexName,
        type: '_doc',
        body: payload
    });
    return deleteData;
}

export async function migrateToProdEventBackupIndex(labname){
    var eventData = client.reindex({
        "body": {
            "source": {
                "index":  getEsIndex(),
                "query": {
                    "match": {
                        "clientname": labname
                    }
                  }
            },
            "dest": {
                "index": constants.ES_EVENT_INDEX_BACKUP_PROD
            } 
        }
    })   
    return eventData;
}


export async function generateIndex(indexName){
    try{
        let temp  = await client.indices.create({  
            index: indexName
        });
        if(temp.err || temp.error){
            return {
                error:temp.err || temp.error ,
                result: null
            };
        }
        return {
            error: null,
            result: temp
        };
    }catch(e){
        console.log(e);
        return {
            error: e,
            result: null
        }
    }
  
}

export async function migrateEsDataForBackup(input){
    var eventData = client.reindex({
        "body": {
            "source": {
                "index":  input.srcIndex,
                "query": {
                    "match": {
                        "labname": input.labname
                    }
                  }
            },
            "dest": {
                "index": input.destinationIndex
            } 
        }
    })   
    return eventData;
}

export async function getV2LiveLabs() {

    let resultLabsArray: string[] = [];

    let prodLiveLabsData = await getV2LiveLabsProduction();
    let betaLiveLabsData = await getV2LiveLabsBeta();

    if (prodLiveLabsData.result) {
        resultLabsArray = prodLiveLabsData.result;
    }

    if (betaLiveLabsData.result) {
        if (!resultLabsArray.length) {
            resultLabsArray = betaLiveLabsData.result;
        } else {
            for (let labName of betaLiveLabsData.result) {
                if (resultLabsArray.indexOf(labName) < 0) {
                    resultLabsArray.push(labName);    
                }
            }
        }
    }
    return {
        error: null,
        result: resultLabsArray
    }    

}



export async function getEventsLiveLabs() {

    let resultLabsArray: string[] = [];

    let prodLiveLabsData = await getV2LiveLabsProductionData();
    let betaLiveLabsData = await getV2LiveLabsBetaData();

    if (prodLiveLabsData.result) {
        resultLabsArray = prodLiveLabsData.result;
    }

    if (betaLiveLabsData.result) {
        if (!resultLabsArray.length) {
            resultLabsArray = betaLiveLabsData.result;
        } else {
            for (let labName of betaLiveLabsData.result) {
                if (resultLabsArray.indexOf(labName) < 0) {
                    resultLabsArray.push(labName);    
                }
            }
        }
    }
    return {
        error: null,
        result: resultLabsArray
    }    

}

export async function getV2LiveLabsProduction() {
    let temp = await getItem({
        TableName: constants.labSettings,
        Key: {
            labname: constants.liveLabs,
            appname: constants.pepV2
        }
    });
    if (temp.error) {
        return {
            error: temp.error,
            result: null
        }
    }
    let docItem = temp.result;
    return {
        error: temp.error,
        result: docItem.live_labs
    }
}

export async function getV2LiveLabsBeta() {
    let temp = await getItem({
        TableName: constants.labSettingsBeta,
        Key: {
            labname: constants.liveLabs,
            appname: constants.pepV2
        }
    });
    if (temp.error) {
        return {
            error: temp.error,
            result: null
        }
    }
    let docItem = temp.result;
    return {
        error: temp.error,
        result: docItem.live_labs
    }
}


export async function getV2LiveLabsProductionData() {
    let temp = await getItem({
        TableName: constants.labSettings,
        Key: {
            labname: constants.liveLabs,
            appname: constants.pepV2
        }
    });
    if (temp.error) {
        return {
            error: temp.error,
            result: null
        }
    }
    let docItem = temp.result;
    return {
        error: temp.error,
        result: docItem.live_events_labs
    }
}

export async function getV2LiveLabsBetaData() {
    let temp = await getItem({
        TableName: constants.labSettingsBeta,
        Key: {
            labname: constants.liveLabs,
            appname: constants.pepV2
        }
    });
    if (temp.error) {
        return {
            error: temp.error,
            result: null
        }
    }
    let docItem = temp.result;
    return {
        error: temp.error,
        result: docItem.live_events_labs
    }
}

export async function getItem(params: any) {
    return new Promise < {
        error: any;
        result: any;
        message ? : string;
    } > ((resolve, reject) => {
        // console.log(`Getting Item from dynamo, Params: ${JSON.stringify(params)}`);
        docClient.get(params, (err, data) => {
            if (err) {
                console.error(`Unable to get item. Error JSON:  ${JSON.stringify(err)}`);
                resolve({
                    error: err,
                    result: null,
                    message: 'failed'
                });
                return;
            }
            resolve({
                error: null,
                result: data.Item || null,
                message: 'success'
            });
        });
    });
}

function getTodayDate() {
    let offsetInMs = 0;
    let tz = momenttz().tz("Asia/Kolkata");
    let date = tz.toDate();
    if (offsetInMs > 0 || offsetInMs < 0) {
        date.setTime(date.getTime() + offsetInMs);
    }
    return date;
}

async function gzip(data: any) {
    return new Promise < {
        err: any,
        result: any
    } > ((resolve, reject) => {
        zlib.gzip(data, (err: Error, result: any) => {
            resolve({
                err,
                result
            });
        });
    });
}

export async function uploadOnS3Internal(key: string, data: string) {
    let compressedData = await gzip(data);
    let s3Param = {
        Body: compressedData.result,
        Bucket: constants.bucket,
        Key: key
    }
    try {
        let temp = await s3.putObject(s3Param).promise();
        return temp;
    } catch (e) {
        console.log(e);
        return {
            err: e,
            result: null
        }
    }
}
export async function uploadOnS3InternalForWhatsApp(key: string, data: string, bucket: string) {
    console.log('***startuploadOnS3InternalForWhatsApp');
    let compressedData = await gzip(data);
    let s3Param = {
        Body: compressedData.result,
        Bucket: bucket,
        Key: key
    }
    try {
        console.log('s3Param', s3Param);
        let temp = await s3.putObject(s3Param).promise();
        console.log('response of s3', temp);
        return temp;
    } catch (e) {
        console.log(e);
        return {
            err: e,
            result: null
        }
    }
}


export function getEsIndex() {
    if (isProduction()) {
        return constants.ES_EVENT_INDEX_PROD;
    }
    return constants.ES_EVENT_INDEX;
}

export function getWhatsAppEsIndex() {
    if (isProduction()) {
        return constants.ES_WHAtSAPP_INDEX;
    }
    return constants.ES_WHAtSAPP_INDEX;
}

export function isProduction(key: string = null): boolean {
    if(key && (key == 'sa'|| key == 'sarticles' || key == 'bf' || key == 'betafeedbackchat' || key.startsWith('beta'))){
        return false;
    }
    if (process.env.NODE_ENV == 'production') {
        return true;
    }
    return false;
}

export async function invokeLambda(labName: string) {
    return new Promise < {
        err: any,
        result: any
    } > ((resolve) => {
        let funName = 'capture-events-staging-dataTransferToS3';
        if (isProduction()) {
            funName = (process.env.NODE_ENV == 'production')? 'capture-events-production-dataTransferToS3': 'capture-events-prod-dataTransferToS3'
        }
        let params = {
            FunctionName: funName,
            Payload: JSON.stringify({
                labname: labName
            })
        }
        console.log("params", params);
        lambda.invoke(params, (err, data) => {
            if (err) {
                // console.log(err, err.stack);
                sendMail({
                    'content': err
                }, constants.emailId);
                resolve({
                    err,
                    result: null
                });
                return;
            }
            try {
                // console.log(`Lambda invoked successfully. Result: ${data}`);
                resolve({
                    err,
                    result: data.Payload
                });
            } catch (e) {
                resolve({
                    err: e,
                    result: null
                });
            }
        });
    });
}


export function isEventPep(appname: string) {
    if (constants.patients_appnames.indexOf(appname) > -1) {
        return true;
    }
    return false;
}

export function formatChannelName(channelName: string) {
    channelName = channelName.toLowerCase().trim();
    switch (channelName) {
        case 's':
            return 'sms';
        case 'e':
            return 'email';
        case 'w':
            return 'whatsapp';
        default:
            return channelName;
    }
}

export function generateS3Key(keyParam, metainfo) {
    let fileName = getTodayDate().getTime() + ".json.gz";
    let date = new Date();
    let env = isProduction(keyParam.domain.split('.')[0]) ? 'production' : 'staging';
    if (metainfo && metainfo.env) {
        env = metainfo.env;
    }
    let key = `${env}/raw/events/labname=${keyParam.clientname}/appname=${keyParam.appname}/domain=${keyParam.domain.split('.')[0]}/channel=${keyParam.channel}/year=${date.getFullYear()}/month=${date.getMonth() + 1}/date=${date.getDate()}/${fileName}`;
    return key
}

export function generateS3KeyForWhatsapp(keyParam, env) {
    let key;
    console.log("bkt name", constants.getBucketName());
    let fileName = getTodayDate().getTime() + ".json.gz";
    let date = moment().format("YYYY-MM-DD");
    console.log('date', date);
    key = `wa-incoming-msg/labname=${keyParam.labname}/date=${date}/${fileName}`;
    console.log('key11', key);
    return key
}

export function getAggregateDataFromEthena(objArrays: string[], labName: string, dbSelected: string) {
    let tableSelected = isProduction() ? constants.prodTable : constants.betaTable;
    let queryPayload = [];
    for (let index of objArrays) {
        if (index == 'createddate') {
            queryPayload.push(`SELECT 'createddate' AS type, CONCAT(LPAD(CAST(year AS varchar), 4, '0'), '-', LPAD(CAST(month AS varchar), 2, '0'), '-',  LPAD(CAST(date AS varchar), 2, '0')) AS key, COUNT(1) AS count FROM (SELECT year, month,date FROM ${dbSelected}.${tableSelected} WHERE labname = '${labName}')
            GROUP BY year, month, date`)
        } else {
            queryPayload.push(`SELECT '${index}' AS type, ${index} AS key, COUNT(1) AS count FROM ${dbSelected}.${tableSelected} WHERE labname = '${labName}' GROUP BY ${index}`)
        }
    }
    let str = '';
    for (var i = 0; i < queryPayload.length; i++) {
        str = str.concat(queryPayload[i] + ' UNION ');
    }
    let lastIndex = str.lastIndexOf("UNION");
    str = str.substring(0, lastIndex);
    return str;
}

export async function executeStepFunction(params: {
    name: string;
    stateMachineArn: string;
}) {
    return new Promise < {
        error: any;
        result: any;
        message ? : string;
    } > ((resolve, reject) => {
        stepFunctions.startExecution(params, (err, data) => {
            if (err) {
                console.log(err);
                resolve({
                    error: err,
                    result: data,
                    message: 'failed'
                });
                return;
            }
            resolve({
                error: err,
                result: data,
                message: 'success'
            });
        });
    });
}


export async function callAnotherLambda(labName: string, funName: string) {
    return new Promise < {
        err: any,
        result: any
    } > ((resolve) => {
        let params = {
            FunctionName: funName,
            Payload: JSON.stringify({
                labname: labName
            })
        }
        console.log("params", params);
        lambda.invoke(params, (err, data) => {
            if (err) {
                // console.log(err, err.stack);
                sendMail({
                    'content': err
                }, constants.emailId);
                resolve({
                    err,
                    result: null
                });
                return;
            }
            try {
                // console.log(`Lambda invoked successfully. Result: ${data}`);
                resolve({
                    err,
                    result: data.Payload
                });
            } catch (e) {
                resolve({
                    err: e,
                    result: null
                });
            }
        });
    });
}


export async function invokeTriggerLambda(params){
    return new Promise(function (resolve) {
        lambda.invoke(params, function (err, data) {
            if (err)
                console.log(err, err.stack); // an error occurred
            console.log(data);
            resolve({
                err: err,
                result: data
            })
            return;
        });
    });
};

export function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export async function generateCacheKeyForSendData(obj, scope) {
    let cacheKey = '';
    let cacheQueryTimestamp = getCacheTimeStamp();
    switch (scope) {
        case 'DS':
            obj.exdate = cacheQueryTimestamp;
            cacheKey = await generateCacheKey(obj);
            break;
    }
    return cacheKey;
}

function getCacheTimeStamp() {
    let date = new Date();
    let day = date.getDate();
    let monthIndex = date.getMonth() + 1;
    let year = date.getFullYear();
    let cacheQueryTimestamp = day + "" + monthIndex + "" + year;
    return cacheQueryTimestamp;
}


async function generateCacheKey (postData) {
    var str:any = JSON.stringify(postData);
    str = str.split("");
    str = str.sort();
    str = str.sort(case_insensitive_comp);
    str = str.join("");
    str += process.env.NODE_ENV != 'production' ? 'dev' : 'production'
    return str;
}

function case_insensitive_comp(strA, strB) {
    return strA.toLowerCase().localeCompare(strB.toLowerCase());
}
export function getNowDate(){
    return moment.utc(new Date()).utcOffset("+05:30").format('YYYY-MM-DD');
}

export async function checkForCacheHitQB(cacheKey){
    let response = { "status": 0, "query": "", "scope": "", "baseQuery": "-", "campaign": "", "error": "" };
    var params = {
        TableName: constants.cacheTable,
        Key: {
            "cachekey": cacheKey
        }
    };
    try {
        const data = await docClient.get(params).promise();
        let item = data.Item ? data.Item : data;
        if (item.baseQuery) {
            response.status = 1;
            response.baseQuery = item.baseQuery;
            response.query = item.query;
            response.scope = item.scope;
            response.campaign = item.campaign;
            response["email"] = item.email;
        }
        console.log(" DATA ITEMS ========== ", JSON.stringify(data));
    } catch (err) {
        console.error(cacheKey, "Unable to fetch queryids for cacheKey . Error JSON:", JSON.stringify(err, null, 2));
        response.status = 0;
        response.error = err;
    }
    return response;
}

export async function updateCacheKeyForNewDataQuery(queryFilter, cachekey, queryId, email) {
    let response = { "status": 0, "data": {}, "error": "" };
    let ttlInHoursConst = constants.ttlInHoursDataConst;
    var params = {
        TableName: constants.cache_table,
        Item: {
            "cachekey": cachekey,
            "scope": 'dmr_deshboard_migration',
            "createdtime": (new Date).getTime(),
            "ttl": getTTLForDuration(ttlInHoursConst),
            'baseQuery': queryId,
            'query': queryFilter,
            // 'email': email != undefined ? email : ''
        }
    };
    if (email)
        params.Item["email"] = email;

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

function getTTLForDuration(hours) {
    let epocTTL = new Date().setTime(new Date().getTime() + (hours * 60 * 60 * 1000));
    return Math.floor(epocTTL / 1000);

}

export function parseJSON (result) {
    if (typeof result == "object") {
        for (let key in result) {
            let member = result[key];
            if (!member || typeof member != "string" || !member[0] || ["{", "["].indexOf(member[0]) < 0) {
                continue;
            }
            result[key] = parseJSON(member);
        }
        return result;
    }
    try {
        if (result && typeof result == "string" && ["{", "["].indexOf(result[0]) >= 0) {
            return JSON.parse(result);
        }
    } catch (Exception) {
        console.log("parser json error: " + result);
        console.trace();
    }
    return result;
}

export async function getRowsFromAthena(query: string) {
    let athenaResult = await athenaExpress.query({
        sql: query
    });
    let rows = athenaResult.Items;
    return {
        err: null,
        result: rows
    }
}

export async function batchWriteData(data) {
    return new Promise<{
        err: any,
        result: any,
        message?: string
    }>((resolve) => {
        var processItemsCallback = function (err, data) {
            if (err) {
                //fail
                return resolve({
                    err: err,
                    result: null
                })
            } else {
                console.log(" listOfDataUrlForBitlinkReplace :", JSON.stringify(data, null, 2));

                var params = {
                    RequestItems: {

                    }
                };
                params.RequestItems = data.UnprocessedItems;
                /*
                * Added Code block 
                */
                if (Object.keys(params.RequestItems).length != 0) {
                    docClient.batchWrite(params, processItemsCallback);
                } else {
                    return resolve({
                        err: null,
                        result: 'result'
                    })
                }
            }
        };

        docClient.batchWrite(data, processItemsCallback);

    })

}

export function getEPOCHSeconds() {
    return moment.utc(new Date()).utcOffset("+05:30").unix();
}


