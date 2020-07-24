import {ResponseMetadata}  from './common';

export interface ICreateQueueRes extends ResponseMetadata{
    QueueUrl         : string
}; 

export interface IListQueueRes extends ResponseMetadata{
    QueueUrls        : string[]
}

export interface IEmptyDeleteQueueRes extends ResponseMetadata{}


