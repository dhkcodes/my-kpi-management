import { calculateFiscalYearDataset, FiscalYearDataset } from "./kpiCalculations";
import { FiscalYear, parseWorkbookSeed, WorkbookSeed } from "./kpiExcelParser";

export type { FiscalYear, ParsedKpiActivityRow, Quarter, WorkloadStage } from "./kpiExcelParser";
export type { FiscalYearDataset, GuideSection, KpiOverviewRow, KpiStatus, NewWorkloadQuarter } from "./kpiCalculations";

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  icon?: string;
  code?: string;
  codePlacement?: "before" | "after";
  children?: NavigationItem[];
};

const fy26Seed: WorkbookSeed = {
  fiscalYear: "FY26",
  sourceWorkbook: "doc_7d1b0649a5f9_FY26_KPI_DonghuKim_v1.xlsx",
  rows: [
    {
      id: "FY26-A-Q2-4",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "A",
      kpiName: "Market Awareness",
      srNumber: "SR0001359862",
      description: "ISV Tech Meetup & Opportunity Development Follow-up",
      deliveryDate: "2025-09-30"
    },
    {
      id: "FY26-A-Q3-5",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "A",
      kpiName: "Market Awareness",
      srNumber: "SR0001409551",
      description: "Korea Tech Webinar for ISVs • Presentation • Demonstration • Opportunity Development (Follow-up)",
      deliveryDate: "2026-02-25"
    },
    {
      id: "FY26-A-Q4-6",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "A",
      kpiName: "Market Awareness",
      srNumber: "SR0001435692",
      description: "Autonomous DB and AI Seminar for ISV Customers • Presentation • Demonstration • Opportunity Development (Follow-up)",
      deliveryDate: "2026-03-06"
    },
    {
      id: "FY26-B-Q2-15",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT - TSLine",
      srNumber: "SR0001353587",
      description: "SmartLink의 OKE, Kafka 구성 관련 기술 미팅",
      deliveryDate: "2025-09-11"
    },
    {
      id: "FY26-B-Q2-16",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT - Camelia",
      srNumber: "SR0001353589",
      description: "OCI 서비스 제안 초기 미팅",
      deliveryDate: "2025-09-19"
    },
    {
      id: "FY26-B-Q2-17",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT - Transliner",
      srNumber: "SR0001353590",
      description: "OCI 서비스 제안 초기 미팅",
      deliveryDate: "2025-10-13"
    },
    {
      id: "FY26-B-Q2-18",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "iRim - YSWater",
      srNumber: "SR0001352712",
      description: "OCI 서비스 제안 초기 미팅",
      deliveryDate: "2025-09-01"
    },
    {
      id: "FY26-B-Q2-19",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "iRim - Seoul Media",
      srNumber: "SR0001352713",
      description: "OCI 서비스 제안 초기 미팅",
      deliveryDate: "2025-10-27"
    },
    {
      id: "FY26-B-Q2-20",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "HN - VT-Cosmetics",
      srNumber: "SR0001353671",
      description: "OCI 서비스 제안 초기 미팅 (성능 이슈 논의 포함(",
      deliveryDate: "2025-10-24"
    },
    {
      id: "FY26-B-Q2-21",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT - TSLine",
      srNumber: "SR0001353588",
      description: "TSL 프로젝트 진행을 위한 OCI 기술 검토 미팅",
      deliveryDate: "2025-09-12"
    },
    {
      id: "FY26-B-Q2-22",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT - OrientStarLogix-Kuwait",
      srNumber: "SR0001360830",
      description: "Database@Azure Q&A 미팅",
      deliveryDate: "2025-11-04"
    },
    {
      id: "FY26-B-Q2-23",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT - ONE Tiger Exp.",
      srNumber: "SR0001360832",
      description: "ONE Tiger 관련 추가 서비스 제안 및 아키텍쳐 리뷰 미팅",
      deliveryDate: "2025-10-31"
    },
    {
      id: "FY26-B-Q2-24",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT - Camelia",
      srNumber: "SR0001360987",
      description: "CLT Camelia의 DR 구성을 위한 가이드",
      deliveryDate: "2025-11-12"
    },
    {
      id: "FY26-B-Q2-25",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT - ONE Tiger Exp.",
      srNumber: "SR0001362417",
      description: "Cloud Agent 관련 질의응답 지원",
      deliveryDate: "2025-11-14"
    },
    {
      id: "FY26-B-Q2-26",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT - DR",
      srNumber: "SR0001362416",
      description: "Primary 리전 구성안에 따른 DR 구성 가이드",
      deliveryDate: "2025-11-21"
    },
    {
      id: "FY26-B-Q3-27",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "RSupport",
      srNumber: "SR0001373448",
      description: "RSupport - Organization, DRG with Cross Tenancy, WAF 관련 가이드 요청",
      deliveryDate: "2025-12-01"
    },
    {
      id: "FY26-B-Q3-28",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT - Transliner",
      srNumber: "SR0001377846",
      description: "OCI 아키텍처 구성 리뷰",
      deliveryDate: "2025-12-02"
    },
    {
      id: "FY26-B-Q3-29",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT - 동진상선",
      srNumber: "SR0001375251",
      description: "CLT 동진상선 - 잦은 Reboot Maintenance에 따른 고객 불만 대응",
      deliveryDate: "2025-12-03"
    },
    {
      id: "FY26-B-Q3-30",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001378036",
      description: "CLT DR - 다양한 Primary 구축 환경에 따른 DR 방안 미팅 및 가이드",
      deliveryDate: "2025-12-19"
    },
    {
      id: "FY26-B-Q3-31",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001377847",
      description: "CLT DR - 다양한 Primary 구축 환경에 따른 DR 방안 고객 미팅",
      deliveryDate: "2025-12-09"
    },
    {
      id: "FY26-B-Q3-32",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001397964",
      description: "CLT - OCI New MOS (My Oracle Support) 계정 관리 방안 제공",
      deliveryDate: "2026-01-27"
    },
    {
      id: "FY26-B-Q3-33",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001397962",
      description: "CLT - OCI Base Database ECPU 도입을 위한 보고 자료 준비 및 리뷰",
      deliveryDate: "2026-01-28"
    },
    {
      id: "FY26-B-Q3-34",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001398079",
      description: "CLT - VMWare Oracle DB (Testbed) Migration to OCI",
      deliveryDate: "2026-01-28"
    },
    {
      id: "FY26-B-Q3-35",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001403853",
      description: "CLT - ECPU 기반 OCI Database 구성 방안 지원",
      deliveryDate: "2026-02-09"
    },
    {
      id: "FY26-B-Q3-36",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "Deepbluedot",
      srNumber: "SR0001408919",
      description: "OCI GenAI 서비스 Rate Limit 오류 해결 지원 및 Limit 해제 요청 지원",
      deliveryDate: "2026-02-16"
    },
    {
      id: "FY26-B-Q3-37",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "UAngel",
      srNumber: "SR0001411758",
      description: "MDS OCPU to ECPU 전환 Follow-up",
      deliveryDate: "2026-02-25"
    },
    {
      id: "FY26-B-Q3-38",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001411785",
      description: "CLT (TSLine) - OCI Streaming with Apache Kafka Issue Follow-up",
      deliveryDate: "2026-02-27"
    },
    {
      id: "FY26-B-Q4-39",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "RSupport",
      srNumber: "SR0001415122",
      description: "Autonomous Database & AI Agent W/S 아젠다 및 사전 준비를 위한 미팅",
      deliveryDate: "2026-03-03"
    },
    {
      id: "FY26-B-Q4-40",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001418195",
      description: "CLT - Base Database Recovery Service Backup 구성 지원",
      deliveryDate: "2026-03-09"
    },
    {
      id: "FY26-B-Q4-41",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001422954",
      description: "CLT - Kafka Cluster Storage Resizing 방안?",
      deliveryDate: "2026-03-13"
    },
    {
      id: "FY26-B-Q4-42",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "Helper Robotics",
      srNumber: "SR0001426878",
      description: "PoC 진행을 위한 JEP document review",
      deliveryDate: "2026-03-24"
    },
    {
      id: "FY26-B-Q4-43",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001428192",
      description: "CLT TSLines - OCI Site-to-Site VPN 구성 지원 (Yamaha RTX1210)",
      deliveryDate: "2026-03-30"
    },
    {
      id: "FY26-B-Q4-44",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001432283",
      description: "CLT TSLines - Email Delivery Service 구성 지원",
      deliveryDate: "2026-03-31"
    },
    {
      id: "FY26-B-Q4-45",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001432284",
      description: "Multiple Standby Database 구성 가이드",
      deliveryDate: "2026-04-06"
    },
    {
      id: "FY26-B-Q4-46",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001435750",
      description: "CLT ONE - OCI Maintenance 대응 지원",
      deliveryDate: "2026-04-08"
    },
    {
      id: "FY26-B-Q4-47",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "iRim T&C",
      srNumber: "SR0001435770",
      description: "신규 옵티 발굴을 위한 전략 미팅",
      deliveryDate: "2026-04-10"
    },
    {
      id: "FY26-B-Q4-48",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "비욘드엔티티",
      srNumber: "SR0001432207",
      description: "비욘드엔티티 - 미라클 프로젝트를 위한 고객 미팅 (B-Early discovery with customer)",
      deliveryDate: "2026-04-01"
    },
    {
      id: "FY26-B-Q4-49",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "이썸",
      srNumber: "SR0001432240",
      description: "이썸 - 미라클 프로젝트를 위한 고객 미팅 (B-Early discovery with customer)",
      deliveryDate: "2026-04-03"
    },
    {
      id: "FY26-B-Q4-50",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001436858",
      description: "CLT Asyaport (Türkiye) - 제안 초기 미팅",
      deliveryDate: "2026-05-04"
    },
    {
      id: "FY26-B-Q4-51",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CLT",
      srNumber: "SR0001437940",
      description: "CLT Cameila - OCI Reboot Maintenance로 인한 Shared Block Volume 장애 지원",
      deliveryDate: "2026-04-23"
    },
    {
      id: "FY26-C1-Q1-3",
      fiscalYear: "FY26",
      quarter: "Q1",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "CLT - TSLine Demo",
      srNumber: "SR0001377848",
      description: "CLT TSLine Demo - Solution Deployment 지원 요청"
    },
    {
      id: "FY26-C1-Q2-9",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "CLT - TSLine",
      srNumber: "SR0001353576",
      description: "OCI OKE의 Hands on 교육 for SmartLink",
      deliveryDate: "2025-09-16"
    },
    {
      id: "FY26-C1-Q2-10",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "Concentrix - AI Agent",
      srNumber: "SR0001309609",
      description: "콘센트릭스 대상 OCI Gen AI 및 AI Agent 소개 및 데모 세션",
      deliveryDate: "2025-09-18"
    },
    {
      id: "FY26-C1-Q2-11",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "WINS",
      srNumber: "SR0001304625",
      description: "Discovery Workshop",
      deliveryDate: "2025-09-15"
    },
    {
      id: "FY26-C1-Q2-12",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "Saltlux",
      srNumber: "SR0001314444",
      description: "Discovery Workshop",
      deliveryDate: "2025-09-22"
    },
    {
      id: "FY26-C1-Q2-13",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "Nable - AICC",
      srNumber: "SR0001350194",
      description: "AICC 대상 AI 소개 세션",
      deliveryDate: "2025-10-30"
    },
    {
      id: "FY26-C1-Q2-14",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "CLT - AI for Allegro",
      srNumber: "SR0001373308",
      description: "AI 서비스 소개 세션",
      deliveryDate: "2025-11-03"
    },
    {
      id: "FY26-C1-Q2-15",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "Softcamp",
      srNumber: "SR0001362236",
      description: "Discovery Workshop",
      deliveryDate: "2025-11-18"
    },
    {
      id: "FY26-C1-Q3-16",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "Saltlux",
      srNumber: "SR0001378035",
      description: "AI Innovation Center - AI Service Discovery 미팅",
      deliveryDate: "2025-12-08"
    },
    {
      id: "FY26-C1-Q3-17",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "Cloit",
      srNumber: "SR0001389457",
      description: "Cloit - AgentGo 워크로드 관련 Discovery Workshop",
      deliveryDate: "2026-01-13"
    },
    {
      id: "FY26-C1-Q3-18",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "RSupport",
      srNumber: "SR0001395748",
      description: "Rsupport AI 관련 Discovery Workshop",
      deliveryDate: "2026-01-13"
    },
    {
      id: "FY26-C1-Q3-19",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "Exem",
      srNumber: "SR0001408916",
      description: "Discovery W/S, MongoDB 관련 워크로드 파악",
      deliveryDate: "2026-02-20"
    },
    {
      id: "FY26-C1-Q4-22",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "RSupport",
      srNumber: "SR0001415119",
      description: "Discovery Workshop for Autonomous Database & AI Agent",
      deliveryDate: "2026-03-06"
    },
    {
      id: "FY26-C1-Q4-23",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "슈퍼커넥트",
      srNumber: "SR0001438622",
      description: "미라클 관련 Workload 파악을 위한 Discovery Workshop",
      deliveryDate: "2026-04-27"
    },
    {
      id: "FY26-C2-Q2-9",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "C2",
      kpiName: "POCs",
      workload: "CLT - TSLine",
      srNumber: "SR0001353578",
      description: "SmartLink PoC - OKE Deployment and Configuration",
      deliveryDate: "2025-09-26"
    },
    {
      id: "FY26-C2-Q2-10",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "C2",
      kpiName: "POCs",
      workload: "CLT - TSLine",
      srNumber: "SR0001353579",
      description: "SmartLink PoC - Streaming with Apache Kafka Configuration",
      deliveryDate: "2025-09-25"
    },
    {
      id: "FY26-C2-Q2-11",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "C2",
      kpiName: "POCs",
      workload: "CLT - TSLine",
      srNumber: "SR0001354525",
      description: "SmartLink PoC - Integration with OKE and Streaming with Apache Kafka 지원 요청",
      deliveryDate: "2025-10-20"
    },
    {
      id: "FY26-C2-Q2-12",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "C2",
      kpiName: "POCs",
      workload: "CLT - TSLine",
      srNumber: "SR0001354524",
      description: "SmartLink PoC - MDS Deployment and Configuration 지원 요청",
      deliveryDate: "2025-10-23"
    },
    {
      id: "FY26-C2-Q2-13",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "C2",
      kpiName: "POCs",
      workload: "CLT - TSLine",
      srNumber: "SR0001365860",
      description: "NX-Allegro PoC - RAC Database DR 구성",
      deliveryDate: "2025-11-11"
    },
    {
      id: "FY26-C2-Q2-14",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "C2",
      kpiName: "POCs",
      workload: "CLT - TSLine",
      srNumber: "SR0001365861",
      description: "SmartLink PoC - OKE and Apache Kafka DR 구성",
      deliveryDate: "2025-11-24"
    },
    {
      id: "FY26-C2-Q3-15",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "C2",
      kpiName: "POCs",
      workload: "CLT - TSLine",
      srNumber: "SR0001387809",
      description: "OCI Base Database Manual Data Guard PoC",
      deliveryDate: "2025-01-09"
    },
    {
      id: "FY26-C2-Q3-16",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "C2",
      kpiName: "POCs",
      workload: "CLT - TSLine",
      srNumber: "SR0001397963",
      description: "Streaming with Apache Kafka Troubleshooting PoC",
      deliveryDate: "2026-01-30"
    },
    {
      id: "FY26-C2-Q3-17",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "C2",
      kpiName: "POCs",
      workload: "Connexioh",
      srNumber: "SR0001401943",
      description: "Connexioh - Graph DB 사용을 위한 기술 자료 전달 및 원인 분석",
      deliveryDate: "2026-02-04"
    },
    {
      id: "FY26-C2-Q4-21",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "C2",
      kpiName: "POCs",
      workload: "Helper Robotics",
      srNumber: "SR0001432305",
      description: "Autonomous Control System(ACS) OCI Migration PoC",
      deliveryDate: "2026-04-22"
    },
    {
      id: "FY26-C2-Q4-22",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "C2",
      kpiName: "POCs",
      workload: "CyberLogitec",
      srNumber: "SR0001435751",
      description: "Multiple Standby Database PoC",
      deliveryDate: "2026-04-17"
    },
    {
      id: "FY26-C2-Q4-23",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "C2",
      kpiName: "POCs",
      workload: "CyberLogitec",
      srNumber: "SR0001436859",
      description: "Full Stack Disaster Recovery PoC for OKE/MDS/Streaming DR",
      deliveryDate: "2026-04-30"
    },
    {
      id: "FY26-C2-Q4-24",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "C2",
      kpiName: "POCs",
      workload: "CyberLogitec",
      srNumber: "SR0001436860",
      description: "26ai Vector Search and Select AI PoC",
      deliveryDate: "2026-05-08"
    },
    {
      id: "FY26-C2-Q4-25",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "C2",
      kpiName: "POCs",
      workload: "iRim T&C",
      srNumber: "SR0001436424",
      description: "Disaster Recovery PoC for Compute & Base Database DR",
      deliveryDate: "2026-05-15"
    },
    {
      id: "FY26-F-Q2-4",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "F",
      kpiName: "Customer References",
      srNumber: "SR0001369861",
      description: "Request for Customer Reference Content – CyberLogitec TSLine",
      deliveryDate: "2026-11-27"
    },
    {
      id: "FY26-F-Q3-5",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "F",
      kpiName: "Customer References",
      srNumber: "SR0001411765",
      description: "Request for Customer Reference Content – CyberLogitec Camelia",
      deliveryDate: "2026-02-27"
    },
    {
      id: "FY26-F-Q4-6",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "F",
      kpiName: "Customer References",
      srNumber: "SR0001435701",
      description: "Request for Customer Reference Content – iRim T&C Sunghwa",
      deliveryDate: "2026-04-21"
    },
    {
      id: "FY26-H-Q2-4",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "H",
      kpiName: "Technical Blogs / Articles",
      workload: "Technical content",
      description: "Creating a cluster for OCI Streaming with Apache Kafka Service",
      deliveryDate: "2026-10-02"
    },
    {
      id: "FY26-H-Q3-5",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "H",
      kpiName: "Technical Blogs / Articles",
      workload: "Technical content",
      description: "Introduction to AI Database Private Agent Factory",
      deliveryDate: "2026-02-27"
    },
    {
      id: "FY26-H-Q4-6",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "H",
      kpiName: "Technical Blogs / Articles",
      workload: "Technical content",
      description: "Multiple Standby Database with Base Database",
      deliveryDate: "2026-05-29"
    },
    {
      id: "FY26-D1-Q1-onboarded-overview",
      fiscalYear: "FY26",
      quarter: "Q1",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Onboarded summary",
      description: "Onboarded New Workload from KPI Overview (Not Achieved)",
      stage: "onboarded",
      amountK: 25.0
    },
    {
      id: "FY26-D1-Q1-validated-overview",
      fiscalYear: "FY26",
      quarter: "Q1",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Validated summary",
      description: "Validated New Workload from KPI Overview (Not Achieved)",
      stage: "validated",
      amountK: 0.0
    },
    {
      id: "FY26-D1-Q1-identified-overview",
      fiscalYear: "FY26",
      quarter: "Q1",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Identified summary",
      description: "Identified New Workload from KPI Overview (Not Achieved)",
      stage: "identified",
      amountK: 0.0
    },
    {
      id: "FY26-D1-Q2-onboarded-overview",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Onboarded summary",
      description: "Onboarded New Workload from KPI Overview (Not Achieved)",
      stage: "onboarded",
      amountK: 7.0
    },
    {
      id: "FY26-D1-Q2-validated-overview",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Validated summary",
      description: "Validated New Workload from KPI Overview (Not Achieved)",
      stage: "validated",
      amountK: 606.0
    },
    {
      id: "FY26-D1-Q2-identified-overview",
      fiscalYear: "FY26",
      quarter: "Q2",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Identified summary",
      description: "Identified New Workload from KPI Overview (Not Achieved)",
      stage: "identified",
      amountK: 81.0
    },
    {
      id: "FY26-D1-Q3-onboarded-overview",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Onboarded summary",
      description: "Onboarded New Workload from KPI Overview (Not Achieved)",
      stage: "onboarded",
      amountK: 375.0
    },
    {
      id: "FY26-D1-Q3-validated-overview",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Validated summary",
      description: "Validated New Workload from KPI Overview (Not Achieved)",
      stage: "validated",
      amountK: 529.5
    },
    {
      id: "FY26-D1-Q3-identified-overview",
      fiscalYear: "FY26",
      quarter: "Q3",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Identified summary",
      description: "Identified New Workload from KPI Overview (Not Achieved)",
      stage: "identified",
      amountK: 57.0
    },
    {
      id: "FY26-D1-Q4-onboarded-overview",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Onboarded summary",
      description: "Onboarded New Workload from KPI Overview (Not Achieved)",
      stage: "onboarded",
      amountK: 30.0
    },
    {
      id: "FY26-D1-Q4-validated-overview",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Validated summary",
      description: "Validated New Workload from KPI Overview (Not Achieved)",
      stage: "validated",
      amountK: 918.0
    },
    {
      id: "FY26-D1-Q4-identified-overview",
      fiscalYear: "FY26",
      quarter: "Q4",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Identified summary",
      description: "Identified New Workload from KPI Overview (Not Achieved)",
      stage: "identified",
      amountK: 95.0
    }
  ]
};

const fy27Seed: WorkbookSeed = {
  fiscalYear: "FY27",
  sourceWorkbook: "doc_6c3705e1d6b9_FY27_KPI_DonghuKim_v1.xlsx",
  rows: [
    {
      id: "FY27-B-Q1-3",
      fiscalYear: "FY27",
      quarter: "Q1",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "PARAMETA ICON",
      srNumber: "SR0001460103",
      description: "컨섬션 증진 방안 미팅 w/ 정진우 실장",
      deliveryDate: "2026-06-05"
    },
    {
      id: "FY27-B-Q1-4",
      fiscalYear: "FY27",
      quarter: "Q1",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CyberLogitec - Israel/Türkiye",
      srNumber: "SR0001460107",
      description: "프로젝트 진행상황 공유 및 제안 현황 파악",
      deliveryDate: "2026-06-16"
    },
    {
      id: "FY27-B-Q1-5",
      fiscalYear: "FY27",
      quarter: "Q1",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CyberLogitec - Israel",
      srNumber: "SR0001467757",
      description: "OCI 견적 리뷰, 기술요건 검토 (Israel)",
      deliveryDate: "2026-06-30"
    },
    {
      id: "FY27-B-Q1-6",
      fiscalYear: "FY27",
      quarter: "Q1",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "Superconnect",
      srNumber: "SR0001467759",
      description: "OCI 운영 플랜 논의, 관리자 대상 Basic 교육",
      deliveryDate: "2026-07-03"
    },
    {
      id: "FY27-B-Q1-7",
      fiscalYear: "FY27",
      quarter: "Q1",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "OntheIT",
      srNumber: "SR0001471809",
      description: "OCI 초기 제언 미팅",
      deliveryDate: "2026-07-13"
    },
    {
      id: "FY27-B-Q1-8",
      fiscalYear: "FY27",
      quarter: "Q1",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "CyberLogitec - Kuwait OTM",
      srNumber: "SR0001473073",
      description: "Kuwait OTM 운영현황 점검 및 확대 방향 협의",
      deliveryDate: "2026-07-15"
    },
    {
      id: "FY27-B-Q1-9",
      fiscalYear: "FY27",
      quarter: "Q1",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "큐비트시큐리티",
      srNumber: "SR0001481111",
      description: "OCI Network 보안 서비스 관련 질의 응답 및 PoC 지원 방안 논의",
      deliveryDate: "2026-07-24"
    },
    {
      id: "FY27-B-Q1-10",
      fiscalYear: "FY27",
      quarter: "Q1",
      kpiCode: "B",
      kpiName: "Early Discovery with Customers",
      workload: "42Tapes",
      srNumber: "SR0001481112",
      description: "OCI 배포 지원 (기본 구성 지원 포함)",
      deliveryDate: "2026-07-31"
    },
    {
      id: "FY27-C1-Q1-3",
      fiscalYear: "FY27",
      quarter: "Q1",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "RSUPPORT",
      srNumber: "SR0001460111",
      description: "정기 기술 미팅 (지원 현황, OCI 업데이트)",
      deliveryDate: "2026-06-25"
    },
    {
      id: "FY27-C1-Q1-4",
      fiscalYear: "FY27",
      quarter: "Q1",
      kpiCode: "C1",
      kpiName: "Workshops",
      workload: "CyberLogitec",
      srNumber: "SR0001478046",
      description: "OCI Base DB ECPU & Exascale 소개 세션",
      deliveryDate: "2026-07-27"
    },
    {
      id: "FY27-H-Q1-3",
      fiscalYear: "FY27",
      quarter: "Q1",
      kpiCode: "H",
      kpiName: "Technical Blogs / Articles",
      workload: "Technical content",
      description: "OCI Base Database에서 Data Guard Group 구성하기 \nOCI Base Database에서 Autonomous Recovery Service 구성하기",
      deliveryDate: "2026-06-06"
    },
    {
      id: "FY27-D1-Q1-onboarded-overview",
      fiscalYear: "FY27",
      quarter: "Q1",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Onboarded summary",
      description: "Onboarded New Workload from KPI Overview (Not Achieved)",
      stage: "onboarded",
      amountK: 14.0
    },
    {
      id: "FY27-D1-Q1-validated-overview",
      fiscalYear: "FY27",
      quarter: "Q1",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Validated summary",
      description: "Validated New Workload from KPI Overview (Not Achieved)",
      stage: "validated",
      amountK: 370.0
    },
    {
      id: "FY27-D1-Q1-identified-overview",
      fiscalYear: "FY27",
      quarter: "Q1",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Identified summary",
      description: "Identified New Workload from KPI Overview (Not Achieved)",
      stage: "identified",
      amountK: 0.0
    },
    {
      id: "FY27-D1-Q2-onboarded-overview",
      fiscalYear: "FY27",
      quarter: "Q2",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Onboarded summary",
      description: "Onboarded New Workload from KPI Overview (Not Achieved)",
      stage: "onboarded",
      amountK: 0.0
    },
    {
      id: "FY27-D1-Q2-validated-overview",
      fiscalYear: "FY27",
      quarter: "Q2",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Validated summary",
      description: "Validated New Workload from KPI Overview (Not Achieved)",
      stage: "validated",
      amountK: 0.0
    },
    {
      id: "FY27-D1-Q2-identified-overview",
      fiscalYear: "FY27",
      quarter: "Q2",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Identified summary",
      description: "Identified New Workload from KPI Overview (Not Achieved)",
      stage: "identified",
      amountK: 0.0
    },
    {
      id: "FY27-D1-Q3-onboarded-overview",
      fiscalYear: "FY27",
      quarter: "Q3",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Onboarded summary",
      description: "Onboarded New Workload from KPI Overview (Not Achieved)",
      stage: "onboarded",
      amountK: 0.0
    },
    {
      id: "FY27-D1-Q3-validated-overview",
      fiscalYear: "FY27",
      quarter: "Q3",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Validated summary",
      description: "Validated New Workload from KPI Overview (Not Achieved)",
      stage: "validated",
      amountK: 0.0
    },
    {
      id: "FY27-D1-Q3-identified-overview",
      fiscalYear: "FY27",
      quarter: "Q3",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Identified summary",
      description: "Identified New Workload from KPI Overview (Not Achieved)",
      stage: "identified",
      amountK: 0.0
    },
    {
      id: "FY27-D1-Q4-onboarded-overview",
      fiscalYear: "FY27",
      quarter: "Q4",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Onboarded summary",
      description: "Onboarded New Workload from KPI Overview (Not Achieved)",
      stage: "onboarded",
      amountK: 0.0
    },
    {
      id: "FY27-D1-Q4-validated-overview",
      fiscalYear: "FY27",
      quarter: "Q4",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Validated summary",
      description: "Validated New Workload from KPI Overview (Not Achieved)",
      stage: "validated",
      amountK: 0.0
    },
    {
      id: "FY27-D1-Q4-identified-overview",
      fiscalYear: "FY27",
      quarter: "Q4",
      kpiCode: "D1",
      kpiName: "New Workload",
      workload: "Identified summary",
      description: "Identified New Workload from KPI Overview (Not Achieved)",
      stage: "identified",
      amountK: 0.0
    }
  ]
};

const workbookSeeds: WorkbookSeed[] = [fy26Seed, fy27Seed];

export const fiscalYears: FiscalYear[] = workbookSeeds.map((seed) => seed.fiscalYear);

export const fiscalYearData: Record<FiscalYear, FiscalYearDataset> = workbookSeeds.reduce((accumulator, seed) => {
  const parsedWorkbook = parseWorkbookSeed(seed);
  accumulator[seed.fiscalYear] = calculateFiscalYearDataset(parsedWorkbook);
  return accumulator;
}, {} as Record<FiscalYear, FiscalYearDataset>);

export const getLatestFiscalYear = (): FiscalYear => fiscalYears[fiscalYears.length - 1];

export const kpiNavItems: NavigationItem[] = [
  { id: "activity-a", label: "1 to many market awareness", href: "#activity-a", code: "A", codePlacement: "before" },
  { id: "activity-b", label: "Early discovery with customer", href: "#activity-b", code: "B", codePlacement: "before" },
  { id: "activity-c1", label: "Show and discover workshops", href: "#activity-c1", code: "C1", codePlacement: "before" },
  { id: "activity-c2", label: "POCs in customer tenancy", href: "#activity-c2", code: "C2", codePlacement: "before" },
  { id: "activity-d1", label: "New workload", href: "#activity-d1", code: "D1", codePlacement: "before" },
  { id: "activity-f", label: "Customer references", href: "#activity-f", code: "F", codePlacement: "before" },
  { id: "activity-h", label: "Technical blogs", href: "#activity-h", code: "H", codePlacement: "before" }
];

export const customerNavItems: NavigationItem[] = [
  { id: "accounts-workloads", label: "Accounts & Workloads", href: "#pipeline", icon: "oj-ux-ico-cloud" },
  { id: "weekly-activities", label: "Weekly Activities", href: "#activities", icon: "oj-ux-ico-calendar-clock" },
  { id: "consumption", label: "Consumption", href: "#consumption", icon: "oj-ux-ico-chart-line" }
];

export const navItems: NavigationItem[] = [
  { id: "home", label: "Home", href: "#cockpit", icon: "oj-ux-ico-home" },
  { id: "my-customers-360", label: "My Customers 360", href: "#customers", icon: "oj-ux-ico-contact-group", children: customerNavItems },
  { id: "kpis", label: "KPIs", href: "#activities", icon: "oj-ux-ico-book", children: kpiNavItems }
];
