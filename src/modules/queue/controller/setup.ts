import { ICreateQueue, IListQueue, IEmptyDeleteQueue } from '../interface/index';


import { getAWSQueue } from './../index';


const SQS = getAWSQueue();

export async function createQueue(params: ICreateQueue): Promise<any> {
    //return await SQS.createQueue(params);
    return new Promise(function (resolve) {
        SQS.createQueue(params, function (err, result) {
            console.log(err, result);
            resolve({ err: err, result: result });
        });
    });
};

export async function listQueues(params: IListQueue): Promise<any> {
    //return await SQS.listQueues(params);
    return new Promise(function (resolve) {
        SQS.listQueues(params, function (err, result) {
            resolve({ err: err, result: result });
        });
    });
};

export async function emptyQueue(params: IEmptyDeleteQueue): Promise<any> {
    //return await SQS.purgeQueue(params);    
    return new Promise(function (resolve) {
        SQS.purgeQueue(params, function (err, result) {
            resolve({ err: err, result: result });
        });
    });
};

export async function deleteQueue(params: IEmptyDeleteQueue): Promise<any> {
    //return await SQS.deleteQueue(params);
    return new Promise(function (resolve) {
        SQS.deleteQueue(params, function (err, result) {
            resolve({ err: err, result: result });
        });
    });
};


