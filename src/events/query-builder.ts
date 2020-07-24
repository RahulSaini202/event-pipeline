const AWS = require('aws-sdk');
AWS.config.update({
    region: 'ap-south-1'
});
const docClient = new AWS.DynamoDB.DocumentClient();
import {constants} from './../config/constants';
var moment = require('moment');


export function getDownloadQuery(payload){
    console.log("labNames11", payload);
    console.log("env checking", process.env.NODE_ENV);
    // let labNamesStr = payload.labNames.join("', '");
    let query : string = '';
    let choice : string = payload.channel;

    
    let cid = '', campValue, camId = '', campId = '', cn = '';

    if (payload.campid) {
        campValue = payload.campid.join("', '");
        console.log('campValue1', campValue);
        cid = `AND cid IN ` + `('${campValue}')`;
        camId = `AND camid IN` + `('${campValue}')`;
        campId = `AND a.campid IN` + `('${campValue}')`;
    }
    if (payload.campName) {
        cn = `AND campaignname like ` + ` '%${payload.campName}%' `;
        // -- campaignname like '%NCD Female%' 
    }
    if(payload.commType == 're'){
        switch(payload.channel){
            case 'email': 
            query = `SELECT  doctor_id as patientid,camid as cid, campaignname, aaa.dispatchtime as msg_sent_date, status as msg_status,clicked_count,first_clicked_date  + interval '5' hour + interval '30' minute as first_clicked_date ,reaction_count, reaction, last_reaction_date + interval '5' hour + interval '30' minute as last_reaction_date FROM (
                SELECT  a.camid, a.campaignname, a.patientid as doctor_id, '' AS doctor_name, a.dispatchdate AS dispatchtime,''as email , a.mobile as mobile ,
                       a.status,
                  cc.clicked_count, from_iso8601_timestamp(dd.createddate) AS first_clicked_date, aa.reaction_count, bb.value AS reaction, from_iso8601_timestamp(bb.createddate) AS last_reaction_date
              FROM (
                  SELECT DISTINCT labname, mobile, camid, campaignname, commtype, patientid,   status, dispatchdate
                FROM ${constants.campignDB_beta()}.email_historical_cleaned_data
                  WHERE labname = '${payload.labName}'
                  -- AND dispatchdate  >= timestamp '2020-06-07 00:00:00.000' and dispatchdate  < timestamp '2020-07-08 00:00:00.000' ${cn}
                AND status NOT IN('invalid', 'blocked', 'cancelled') AND commtype = 're'
              ) a
                  LEFT JOIN (
                      SELECT labname, cid AS campid, userid, COUNT(1) AS reaction_count
                      FROM "etl_raw_dmrdev1".${constants.ESdatabase_beta()}
                      WHERE labname = '${payload.labName}' AND action = 'cta_clicked' AND dryrun != 'true' AND (channel = 'email' OR channel = 'e') AND appname = 're'
                     --  AND createddate >= '2020-06-07 00:00:00.000' AND createddate < '2020-07-08 00:00:00.000'
                     
                      GROUP BY labname, cid, userid
                  ) aa
                  ON a.labname = aa.labname AND a.camid = aa.campid AND a.patientid = aa.userid
                  LEFT JOIN (
                      SELECT * FROM (
                     SELECT labname, cid AS campid, userid, createddate, value,
                     ROW_NUMBER() OVER (PARTITION BY labname, cid, userid ORDER BY createddate DESC) AS rnk
                     FROM "etl_raw_dmrdev1".${constants.ESdatabase_beta()}
                     WHERE labname = '${payload.labName}' AND action = 'cta_clicked' AND dryrun != 'true' AND (channel = 'email' OR channel = 'e') AND appname = 're'
                         -- AND createddate >= '2020-06-07 00:00:00.000' AND createddate < '2020-07-08 00:00:00.000'
                         
                      ) WHERE rnk = 1
                  ) bb
                  ON a.labname = bb.labname AND a.camid = bb.campid AND a.patientid = bb.userid
                  LEFT JOIN (
                      SELECT labname, cid AS campid, userid, COUNT(1) AS clicked_count
                      FROM "etl_raw_dmrdev1".${constants.ESdatabase_beta()}
                      WHERE labname = '${payload.labName}' AND category = 'bitlink_redirection' and action != 'cta_link_clicked' and (channel = 'email' OR channel = 'e') AND appname = 're' AND dryrun != 'true'  
                     --  AND createddate >= '2020-06-07 00:00:00.000'AND createddate < '2020-07-08 00:00:00.000'
                      GROUP BY labname, cid, userid
                  ) cc
                  ON a.labname = cc.labname AND a.camid = cc.campid AND a.patientid = cc.userid
                  LEFT JOIN (
                      SELECT * FROM (
                     SELECT labname, cid AS campid, userid, createddate,
                     ROW_NUMBER() OVER (PARTITION BY labname, cid, userid ORDER BY createddate ASC) AS rnk
                     FROM "etl_raw_dmrdev1".${constants.ESdatabase_beta()}
                     WHERE labname = '${payload.labName}' AND category = 'bitlink_redirection' AND action != 'cta_link_clicked' AND (channel = 'email' OR channel = 'e') AND appname = 're' AND dryrun != 'true'
                     -- AND createddate >= '2020-06-07 00:00:00.000' AND createddate < '2020-07-08 00:00:00.000'
                 ) WHERE rnk = 1
                  ) dd
                  ON a.labname = dd.labname AND a.camid = dd.campid AND a.patientid = dd.userid
                 
                  WHERE a.labname = '${payload.labName}'  AND  status NOT IN('invalid', 'blocked', 'cancelled')  AND a.commtype = 're'
               
                -- AND a.dispatchdate >= timestamp '2020-06-07 00:00:00.000' AND a.dispatchdate < timestamp '2020-07-08 00:00:00.000'
                )aaa
                 
                  inner JOIN (
                      SELECT distinct userid
                           FROM (SELECT *
                           FROM "etl_raw_dmrdev1".${constants.ESdatabase_beta()}
                           WHERE labname =  '${payload.labName}' AND appname = 're' AND (channel = 'email' OR channel = 'e') AND dryrun != 'true'
                           -- AND createddate >=  '2020-06-07 00:00:00.000' AND createddate < '2020-07-08 00:00:00.000'  
                                AND cid IN (
                                       SELECT distinct camid from (SELECT DISTINCT labname, commtype, mobile, dispatchdate, status, deliveryreportid, camid, patientid
                                   FROM ${constants.campignDB_beta()}.email_historical_cleaned_data
                                   WHERE labname =  '${payload.labName}' AND commtype = 're'  
                                  -- AND  dispatchdate >= timestamp  '2020-06-07 00:00:00.000' and dispatchdate < timestamp '2020-07-08 00:00:00.000' ${cn}
                                   AND  status NOT IN ('invalid', 'blocked', 'cancelled') )
                                   
                                   )
                           )
                           WHERE category = 'bitlink_redirection')tt
               
                            ON aaa.doctor_id = tt.userid AND aaa.clicked_count >0             
              `
                                        break;
            case 'sms': 
            query =  `SELECT  doctor_id as patientid,camid as cid, campaignname, aaa.dispatchtime as msg_sent_date, status as msg_status,clicked_count,first_clicked_date  + interval '5' hour + interval '30' minute as first_clicked_date,reaction_count, reaction, last_reaction_date + interval '5' hour + interval '30' minute as last_reaction_date  FROM (
                SELECT  a.camid, a.campaignname, a.patientid as doctor_id, '' AS doctor_name, a.dispatchdate AS dispatchtime,''as email , a.mobile as mobile ,
                       a.status,
                  cc.clicked_count,  from_iso8601_timestamp(dd.createddate) AS first_clicked_date, aa.reaction_count, bb.value AS reaction, from_iso8601_timestamp(bb.createddate) AS last_reaction_date
              FROM (
               
                  SELECT DISTINCT labname, mobile, camid, campaignname, commtype, patientid,  smscount, status, dispatchdate
                FROM ${constants.campignDB_beta()}.pep_historical_cleaned_data
                  WHERE labname = '${payload.labName}'
                 --  AND dispatchdate  >= timestamp '2020-06-07 00:00:00.000' and dispatchdate  < timestamp '2020-07-08 00:00:00.000' ${cn}
                AND status NOT IN('invalid', 'blocked', 'cancelled') AND commtype = 're'
              ) a
                  LEFT JOIN (
                      SELECT labname, cid AS campid, userid, COUNT(1) AS reaction_count
                      FROM "etl_raw_dmrdev1".${constants.ESdatabase_beta()}
                      WHERE labname = '${payload.labName}' AND action = 'cta_clicked' AND dryrun != 'true' AND ( channel = 'sms' OR channel = 's') AND appname = 're'  
                     --  AND createddate >= '2020-06-07 00:00:00.000' AND createddate < '2020-07-08 00:00:00.000'
                     
                      GROUP BY labname, cid, userid
                  ) aa
                  ON a.labname = aa.labname AND a.camid = aa.campid AND a.patientid = aa.userid
                  LEFT JOIN (
                      SELECT * FROM (
                     SELECT labname, cid AS campid, userid, createddate, value,
                     ROW_NUMBER() OVER (PARTITION BY labname, cid, userid ORDER BY createddate DESC) AS rnk
                     FROM "etl_raw_dmrdev1".${constants.ESdatabase_beta()}
                     WHERE labname = '${payload.labName}' AND action = 'cta_clicked' AND dryrun != 'true' AND ( channel = 'sms' OR channel = 's') AND appname = 're'  
                         -- AND createddate >= '2020-06-07 00:00:00.000' AND createddate < '2020-07-08 00:00:00.000'
                         
                      ) WHERE rnk = 1
                  ) bb
                  ON a.labname = bb.labname AND a.camid = bb.campid AND a.patientid = bb.userid
                  LEFT JOIN (
                      SELECT labname, cid AS campid, userid, COUNT(1) AS clicked_count
                      FROM "etl_raw_dmrdev1".${constants.ESdatabase_beta()}
                      WHERE labname = '${payload.labName}' AND category = 'bitlink_redirection' and action != 'cta_link_clicked' and
              ( channel = 'sms' OR channel = 's')AND appname = 're' AND dryrun != 'true'  
                      -- AND createddate >= '2020-06-07 00:00:00.000'AND createddate < '2020-07-08 00:00:00.000'
                      GROUP BY labname, cid, userid
                  ) cc
                  ON a.labname = cc.labname AND a.camid = cc.campid AND a.patientid = cc.userid
                  LEFT JOIN (
                      SELECT * FROM (
                     SELECT labname, cid AS campid, userid, createddate,
                     ROW_NUMBER() OVER (PARTITION BY labname, cid, userid ORDER BY createddate ASC) AS rnk
                     FROM "etl_raw_dmrdev1".${constants.ESdatabase_beta()}
                     WHERE labname = '${payload.labName}' AND category = 'bitlink_redirection' AND action != 'cta_link_clicked' AND
              ( channel = 'sms' OR channel = 's') AND appname = 're' AND dryrun != 'true'
                     -- AND createddate >= '2020-06-07 00:00:00.000' AND createddate < '2020-07-08 00:00:00.000'
                 ) WHERE rnk = 1
                  ) dd
                  ON a.labname = dd.labname AND a.camid = dd.campid AND a.patientid = dd.userid
                 
                  WHERE a.labname = '${payload.labName}' AND  status NOT IN('invalid', 'blocked', 'cancelled')  AND a.commtype = 're'
                -- a.dispatchdate >= timestamp '2020-06-07 00:00:00.000' AND a.dispatchdate < timestamp '2020-07-08 00:00:00.000'
               
                )
                 
                  aaa
                 
                  inner JOIN (
                      SELECT distinct userid
                           FROM (SELECT *
                           FROM "etl_raw_dmrdev1".${constants.ESdatabase_beta()}
                           WHERE labname =  '${payload.labName}' AND appname = 're' AND
              ( channel = 'sms' OR channel = 's') AND dryrun != 'true'
                          -- AND createddate >=  '2020-06-07 00:00:00.000' AND createddate < '2020-07-08 00:00:00.000'  
                                AND cid IN (
                                       SELECT distinct camid from (SELECT DISTINCT labname, commtype, mobile, dispatchdate, status, deliveryreportid, camid, patientid, smscount
                                   FROM ${constants.campignDB_beta()}.pep_historical_cleaned_data
                                   WHERE labname =  '${payload.labName}' AND commtype = 're'  
                                  -- AND  dispatchdate >= timestamp  '2020-06-07 00:00:00.000' and dispatchdate < timestamp '2020-07-08 00:00:00.000' ${cn}
                                   AND  status NOT IN ('invalid', 'blocked', 'cancelled')  )
              
              
                                   
                                   )
                           )
                           WHERE category = 'bitlink_redirection')tt
               
                            ON aaa.doctor_id = tt.userid AND aaa.clicked_count >0
              
              
              `
              break;
        }
    }else{
        switch (choice){
            case 'email' : 
                  
            break;
    
            case 'sms' : 
                query =  `SELECT bb.name, bb.patientid, bb.mobile, aa.campaignname, aa.dispatchdate, aa.status, cc.createddate AS click_datetime FROM (
                    SELECT  DISTINCT labname, patientid, camid AS campid, campaignname, dispatchdate, status, commtype
                    FROM ${constants.campignDB()}.pep_historical_cleaned_data
                    WHERE labname = '${payload.labName}'  AND commtype IN ('pc', 'pl') ${camId}
                    
                    UNION ALL
                    
                    SELECT a.labname, a.patientid, a.campid, a.campaignname, a.dispatchdate, COALESCE(b.status, a.status) AS status, a.commtype
                    FROM ${constants.campignDB()}.thb_sms_sent_summary_liverun a
                    LEFT JOIN (
                    SELECT labname, mobile, camdate, status, deliveryreportid, commtype FROM (
                    SELECT labname, mobile, camdate, status, deliveryreportid, commtype, senttime,
                    ROW_NUMBER() OVER (PARTITION BY labname, mobile, camdate, deliveryreportid, commtype ORDER BY senttime DESC) AS row_num
                    FROM ${constants.campignDB()}.thb_sms_status_summary_deliver
                    WHERE labname = '${payload.labName}' AND date = '${currentDate()}'
                    GROUP BY labname, mobile, camdate, status, deliveryreportid, commtype, senttime
                    ) WHERE row_num = 1
                    ) b
                    ON a.labname = b.labname AND a.commtype = b.commtype AND a.mobile = b.mobile AND a.camdate = b.camdate and a.deliveryreportid = b.deliveryreportid
                    WHERE a.labname = '${payload.labName}' AND a.date = '${currentDate()}' ${campId} AND a.commtype IN ('pc', 'pl')
                    ) aa
                    LEFT JOIN (
                    SELECT labname, remoteid, name, patientid,mobile
                       FROM ${constants.patientDB()}.patients_pii
                       WHERE labname = '${payload.labName}'
                       UNION ALL
    
                        SELECT DISTINCT labname, patientid AS remoteid, name, patientid,mobile
                        FROM sync_leads.${constants.syncLeadDB()}
                        WHERE labname = '${payload.labName}'
                    ) bb
                    ON aa.labname = bb.labname AND aa.patientid = bb.remoteid
                    INNER JOIN (
                    SELECT  DISTINCT labname, cid, userid, createddate
                     FROM "etl_raw_dmrdev1".${constants.ESdatabase()}
                    WHERE labname = '${payload.labName}' ${cid}
                    
                    ) cc
                    ON aa.labname = cc.labname AND  aa.campid = cc.cid AND aa.patientid = cc.userid
                    WHERE lower(campid) not like '%test_%' AND
                                   lower(campid) not like 'test_____%' AND
                                   lower(campaignname) not like 'test_____%' AND
                                   lower(campaignname) not like '%test_%'`
            break;
        }
    }
   
   
    return query;
}

export function campaignListQuery(payload){
    let query : string = '';
    console.log("campaignListQuery", payload);
    if(payload.commType == 're'){
        switch(payload.channel){
            case 'sms': 
               query = `SELECT labname, campid, campaignname, date, 'sms' AS mode FROM (
                        SELECT labname, camid AS campid, campaignname, dispatchdate AS date,
                        ROW_NUMBER() OVER (PARTITION BY labname, camid, campaignname ORDER BY dispatchdate ASC) AS rnk
                        FROM ${constants.campignDB_beta()}.pep_historical_cleaned_data
                        WHERE labname = '${payload.labName}' AND commtype IN ('re')
                ) WHERE rnk = 1`
            break;
            case 'email' : 
                query = `
                SELECT labname, campid, campaignname, date, 'email' AS mode FROM (
                       SELECT labname, camid AS campid, campaignname, dispatchdate AS date,
                        ROW_NUMBER() OVER (PARTITION BY labname, camid, campaignname ORDER BY dispatchdate ASC) AS rnk
                        FROM ${constants.campignDB_beta()}.email_historical_cleaned_data
                        WHERE labname =  '${payload.labName}' AND commtype IN ('re')
                ) WHERE rnk = 1`
        }
        return query;

    }else{
        switch(payload.channel){
            case 'sms' : 
                query = `SELECT * FROM (
                    SELECT labname, campid, campaignname, date, 'sms' AS mode FROM (
                    SELECT labname, camid AS campid, campaignname, dispatchdate AS date,
                    ROW_NUMBER() OVER (PARTITION BY labname, camid, campaignname ORDER BY dispatchdate ASC) AS rnk
                    FROM ${constants.campignDB()}.pep_historical_cleaned_data
                    WHERE labname = '${payload.labName}' AND commtype IN ('pc', 'pl')
                    ) WHERE rnk = 1
                    
                    UNION ALL
                    
                    SELECT labname, campid, campaignname, date, 'sms' AS mode FROM (
                    SELECT labname, campid, campaignname, dispatchdate AS date,
                    ROW_NUMBER() OVER (PARTITION BY labname, campid, campaignname ORDER BY dispatchdate ASC) AS rnk
                    FROM liverun.thb_sms_sent_summary_liverun
                    WHERE  labname = '${payload.labName}' AND date = '${currentDate()}'  AND commtype IN ('pc', 'pl')
                    ) WHERE rnk = 1
                    )
                    WHERE lower(campid) not like '%test_%' AND
                    lower(campid) not like 'test_____%' AND
                    lower(campaignname) not like 'test_____%' AND
                    lower(campaignname) not like '%test_%'
                    ORDER BY date DESC`
                break;
            case 'email':
                query = ''
                break;
            
        }
        return query;
      
    }
    
   
}




function currentDate() {
    return moment().startOf('day').format('YYYY-MM-DD').toString()
}