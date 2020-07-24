import  {ResponseMetadata} from './common';

export interface ISizeRes extends ResponseMetadata{ 
    Attributes  : {
        ApproximateNumberOfMessages : string,
        ApproximateNumberOfMessagesNotVisible : string
    }
};


export interface IPushMessageObjectRes{
    MD5OfMessageBody : string,
    MessageId : string
}

export interface IPushMessageRes extends ResponseMetadata,IPushMessageObjectRes{};

export interface IMultipleMessageObject extends IPushMessageObjectRes{
    Id : string
}

export interface IPushMultipleMessageRes extends ResponseMetadata{ 
    Successful : IMultipleMessageObject[],
    Failed     : any[]
};

export interface IPullMessageObject extends IPushMessageObjectRes{
    ReceiptHandle : string,
    Body          : string  
}

export interface IPullMessageRes extends ResponseMetadata{ 
    Messages : IPullMessageObject[]
};
  
export interface IDeleteMessageRes extends ResponseMetadata{};
export interface IDeleteMultipleMessageRes extends ResponseMetadata{};


