-- 원본: seoseungkwan/shared@2a1069b YangjiBareun_사전점검/vendor/drbit_export/RxHistory.cs Read (스냅숏 격리를 쓸 수 있는지, 되돌리는 트랜잭션 전에)
-- 이 파일과 Precheck.Core/Bit/Sql.cs SnapshotStateSql은 공백만 다를 수 있다(시험이 확인)
SELECT snapshot_isolation_state FROM sys.databases WHERE database_id=DB_ID()
