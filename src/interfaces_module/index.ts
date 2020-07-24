export interface IResponse {
    statusCode: number;
    body: any;
    headers: any;
}

export interface IResponseBody {
    status: number
    message: string
    result: any
}

export interface IInvokeLambda {
    FunctionName: string
    InvocationType: string
    Payload: any
}

export interface ICommTaskS3ReportObject {
    vendor: string,
    payload: any,
    serviceInfo: any
}
