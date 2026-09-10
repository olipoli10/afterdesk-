-- Forward correction after native PostgreSQL exposed a polymorphic NEW record
-- field in CASE (registry table has no clarificationId). Migration76 retained.
-- Only trigger-table dispatch changes; every final proof check remains intact.
CREATE OR REPLACE FUNCTION sms_temporal_final_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q "PersonalSmsTemporalClarification"%ROWTYPE; target TEXT; valid BOOLEAN; failures BIGINT; accepted BIGINT;
BEGIN
  IF TG_TABLE_NAME='PersonalSmsTemporalClarification' THEN
    target:=NEW.id;
  ELSIF TG_TABLE_NAME='PersonalSmsTemporalClarificationReply' THEN
    target:=NEW."clarificationId";
  ELSE
    RAISE EXCEPTION 'temporal final binding trigger table refused';
  END IF;
  SELECT * INTO q FROM "PersonalSmsTemporalClarification" WHERE id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'temporal final row missing'; END IF;
  -- Re-read CURRENT rows: original processing -> completed CAS must commit
  -- with the exact review and full ordinary question, not a partial snapshot.
  SELECT true INTO valid FROM "PersonalAssistantOperation" s JOIN "PersonalAssistantOperation" c ON c.id=q."modelChildOperationId"
    JOIN "PersonalAssistantOperation" o ON o.id=q."questionOutboundOperationId"
    JOIN "ModelGatewayOperation" g ON g.id=q."modelGatewayOperationId"
    JOIN "AiOperation" ai ON ai.id=g."aiOperationId" JOIN "ModelGatewayAttempt" a ON a.id=g."finalAttemptId"
    JOIN "ModelGatewayDecision" d ON d.id=a."decisionId" AND d."gatewayOperationId"=g.id
  WHERE s.id=q."sourceOperationId" AND s."workspaceId"=q."workspaceId" AND s."createdByUserId"=q."userId" AND s.kind='personal_sms_inbound'
    AND s.status='completed' AND s.attempts=1 AND s."leaseUntil" IS NULL AND s.result->'personalModelReview'=q."reviewSnapshot"
    AND s.result->>'reply'=q.prepared->>'wireText' AND s."requestHash"=q.prepared#>>'{source,requestHash}'
    AND sms_temporal_sms_hash(s.request)=s."requestHash" AND s.request->>'contentHash'=s."requestHash"
    AND s.request->>'body'=q.prepared#>>'{source,body}' AND s.request->>'from'=q.prepared#>>'{binding,ownerNumber}' AND s.request->>'to'=q.prepared#>>'{binding,endveraNumber}'
    AND s.request->>'identityId'=q."identityId" AND s.request->>'accountSid'=q.prepared#>>'{source,accountSid}' AND s.request->>'messageSid'=q.prepared#>>'{source,messageSid}'
    AND s."createdAt"=((q.prepared#>>'{source,receivedAt}')::timestamptz AT TIME ZONE 'UTC')
    AND c."workspaceId"=q."workspaceId" AND c."createdByUserId"=q."userId" AND c."sourcePersonalOperationId"=s.id
    AND c.kind='personal_model_candidate_v1' AND c.status='completed' AND c.attempts=1 AND c."modelGatewayOperationId"=g.id
    AND c.result->>'status'='PROPOSAL_STORED_NOT_AUTHORIZED' AND c.result->>'executionAuthorized'='false'
    AND 'sha256:'||sms_temporal_hash(c.result)=q."proposalEvidenceRef" AND g."resultEvidenceRef"=q."proposalEvidenceRef" AND a."responseEvidenceRef"=q."proposalEvidenceRef"
    AND c.result->'proposal'=(q.prepared->>'rawProposal')::jsonb AND sms_temporal_canonical_json(c.result->'proposal')=q.prepared->>'rawProposal'
    AND c.request->>'sourceOperationId'=s.id AND c.request->>'gatewayOperationId'=g.id AND c.request->>'requestFingerprint'=g."requestFingerprint"
    AND (q.prepared->>'rawProposal')::jsonb->>'requestFingerprint'=g."requestFingerprint"
    AND g."tenantId"='construction-workspace:'||q."workspaceId" AND g."operationType"='personal_intent_candidate_v1'
    AND ai."personalAssistantOperationId"=s.id AND ai.purpose='personal_intent_candidate_v1' AND ai.status='succeeded' AND ai.attempts=1
    AND ai."resultId"=c.id AND ai."resultKind"='personal_model_proposal_inspected' AND ai."taskId" IS NULL AND ai."voiceIntakeSegmentId" IS NULL
    AND a."resultContractStatus"='valid' AND d.disposition='route_authorized' AND d.attempt=1
    AND o."workspaceId"=q."workspaceId" AND o."createdByUserId"=q."userId" AND o.kind='sms_outbound' AND o."idempotencyKey"='reply:'||s.id
    AND o."connectorAccountId"=q.prepared#>>'{binding,smsAccountId}' AND o.request=jsonb_build_object('to',s.request->>'from','from',s.request->>'to','text',q.prepared->>'wireText','sourceOperationId',s.id)
    AND o."requestHash"=q."questionRequestHash" AND sms_temporal_question_hash(o.request)=q."questionRequestHash";
  IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'temporal final source candidate question binding mismatch'; END IF;
  IF q.waiting IS NOT NULL THEN
    valid:=false;
    SELECT true INTO valid FROM "PersonalAssistantOperation" o WHERE o.id=q."questionOutboundOperationId" AND o.kind='sms_outbound'
      AND o.status='completed' AND o.attempts=1 AND o."externalTransportPerformed"=true AND o.result->>'acceptedByProvider'='true'
      AND o.result->>'providerSid'=q."acceptedProviderSid" AND o.result->>'approvalHash'=q."questionRequestHash" AND o.result->>'delivered'='false'
      AND ((o.result->>'acceptedAt')::timestamptz AT TIME ZONE 'UTC')=q."acceptedAt";
    IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'temporal immutable recorded acceptance required'; END IF;
  END IF;
  SELECT count(*) FILTER (WHERE outcome='REFUSED'),count(*) FILTER (WHERE outcome='ACCEPTED') INTO failures,accepted
    FROM "PersonalSmsTemporalClarificationReply" WHERE "clarificationId"=q.id;
  IF failures<>q."failedAttempts" OR accepted>1 OR (q.phase='CONSUMED') IS DISTINCT FROM (accepted=1) THEN RAISE EXCEPTION 'temporal exact reply counts mismatch'; END IF;
  IF accepted=1 AND NOT EXISTS (SELECT 1 FROM "PersonalSmsTemporalClarificationReply" WHERE id=q."consumedReplyId" AND "clarificationId"=q.id
      AND "workspaceId"=q."workspaceId" AND "userId"=q."userId" AND outcome='ACCEPTED') THEN RAISE EXCEPTION 'temporal accepted reply mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "PersonalSmsConversationExpectation" WHERE id='temporal:'||q.id AND "clarificationId"=q.id AND namespace=q.namespace
      AND active=(q.phase IN ('PREPARED','WAITING'))) THEN RAISE EXCEPTION 'temporal shared namespace mirror missing'; END IF;
  RETURN NEW;
END $$;
