-- Seed all 61 Private Pilot ACS tasks (FAA-S-ACS-6C)
-- Each element is a top-level K/R/S item; sub-elements are included in parent descriptions.

BEGIN;

-- ============================================================
-- AREA I: Preflight Preparation (9 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.I.A', 'private', 'Preflight Preparation', 'Pilot Qualifications',
  $$[
    {"code":"PA.I.A.K1","description":"Certification requirements, recent flight experience, and recordkeeping"},
    {"code":"PA.I.A.K2","description":"Privileges and limitations"},
    {"code":"PA.I.A.K3","description":"Medical certificates: class, expiration, privileges, temporary disqualifications"},
    {"code":"PA.I.A.K4","description":"Documents required to exercise private pilot privileges"},
    {"code":"PA.I.A.K5","description":"Part 68 BasicMed privileges and limitations"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.A.R1","description":"Proficiency versus currency"},
    {"code":"PA.I.A.R2","description":"Flying unfamiliar aircraft or operating with unfamiliar flight display systems and avionics"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.A.S1","description":"Apply requirements to act as pilot-in-command (PIC) under Visual Flight Rules (VFR) in a scenario given by the evaluator"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.I.B', 'private', 'Preflight Preparation', 'Airworthiness Requirements',
  $$[
    {"code":"PA.I.B.K1","description":"General airworthiness requirements and compliance for airplanes, including: location and expiration dates of required aircraft certificates, required inspections and airplane logbook documentation, Airworthiness Directives and Special Airworthiness Information Bulletins, purpose and procedure for obtaining a special flight permit, owner/operator and pilot-in-command responsibilities"},
    {"code":"PA.I.B.K2","description":"Pilot-performed preventive maintenance"},
    {"code":"PA.I.B.K3","description":"Equipment requirements for day and night VFR flight, including: flying with inoperative equipment, using an approved Minimum Equipment List (MEL), Kinds of Operation Equipment List (KOEL), required discrepancy records or placards"},
    {"code":"PA.I.B.K4","description":"Standard and special airworthiness certificates and their associated operational limitations"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.B.R1","description":"Inoperative equipment discovered prior to flight"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.B.S1","description":"Locate and describe airplane airworthiness and registration information"},
    {"code":"PA.I.B.S2","description":"Determine the airplane is airworthy in the scenario given by the evaluator"},
    {"code":"PA.I.B.S3","description":"Apply appropriate procedures for operating with inoperative equipment in the scenario given by the evaluator"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.I.C', 'private', 'Preflight Preparation', 'Weather Information',
  $$[
    {"code":"PA.I.C.K1","description":"Sources of weather data (e.g., National Weather Service, Flight Service) for flight planning purposes"},
    {"code":"PA.I.C.K2","description":"Acceptable weather products and resources required for preflight planning, current and forecast weather for departure, en route, and arrival phases of flight such as: Airport Observations (METAR and SPECI) and Pilot Observations (PIREP), Surface Analysis Chart, Ceiling and Visibility Chart (CVA), Terminal Aerodrome Forecasts (TAF), Graphical Forecasts for Aviation (GFA), Wind and Temperature Aloft Forecast (FB), Convective Outlook (AC), Inflight Aviation Weather Advisories including AIRMET, SIGMET, and Convective SIGMET"},
    {"code":"PA.I.C.K3","description":"Meteorology applicable to the departure, en route, alternate, and destination under VFR in VMC including expected climate and hazardous conditions such as: atmospheric composition and stability, wind, temperature and heat exchange, moisture/precipitation, weather system formation including air masses and fronts, clouds, turbulence, thunderstorms and microbursts, icing and freezing level information, fog/mist, frost, obstructions to visibility"},
    {"code":"PA.I.C.K4","description":"Flight deck instrument displays of digital weather and aeronautical information"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.C.R1","description":"Making the go/no-go and continue/divert decisions including: circumstances that would make diversion prudent, personal weather minimums, hazardous weather conditions including known or forecast icing or turbulence aloft"},
    {"code":"PA.I.C.R2","description":"Use and limitations of: installed onboard weather equipment, aviation weather reports and forecasts, inflight weather resources"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.C.S1","description":"Use available aviation weather resources to obtain an adequate weather briefing"},
    {"code":"PA.I.C.S2","description":"Analyze the implications of at least three of the conditions listed in K3a through K3l using actual weather or weather conditions provided by the evaluator"},
    {"code":"PA.I.C.S3","description":"Correlate weather information to make a go/no-go decision"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.I.D', 'private', 'Preflight Preparation', 'Cross-Country Flight Planning',
  $$[
    {"code":"PA.I.D.K1","description":"Route planning including consideration of different classes and special use airspace (SUA) and selection of appropriate and available navigation/communication systems and facilities"},
    {"code":"PA.I.D.K2","description":"Altitude selection accounting for terrain and obstacles, glide distance of airplane, VFR cruising altitudes, and effect of wind"},
    {"code":"PA.I.D.K3","description":"Calculating: time, climb and descent rates, course, distance, heading, true airspeed and groundspeed, estimated time of arrival including conversion to universal coordinated time (UTC), fuel requirements including reserve"},
    {"code":"PA.I.D.K4","description":"Elements of a VFR flight plan"},
    {"code":"PA.I.D.K5","description":"Procedures for filing, activating, and closing a VFR flight plan"},
    {"code":"PA.I.D.K6","description":"Inflight intercept procedures"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.D.R1","description":"Pilot"},
    {"code":"PA.I.D.R2","description":"Aircraft"},
    {"code":"PA.I.D.R3","description":"Environment (e.g., weather, airports, airspace, terrain, obstacles)"},
    {"code":"PA.I.D.R4","description":"External pressures"},
    {"code":"PA.I.D.R5","description":"Limitations of air traffic control (ATC) services"},
    {"code":"PA.I.D.R6","description":"Fuel planning"},
    {"code":"PA.I.D.R7","description":"Use of an electronic flight bag (EFB), if used"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.D.S1","description":"Prepare, present, and explain a cross-country flight plan assigned by the evaluator including a risk analysis based on real-time weather, to the first fuel stop"},
    {"code":"PA.I.D.S2","description":"Apply pertinent information from appropriate and current aeronautical charts, Chart Supplements, NOTAMs relative to airport, runway, and taxiway closures, and other flight publications"},
    {"code":"PA.I.D.S3","description":"Create a navigation plan and simulate filing a VFR flight plan"},
    {"code":"PA.I.D.S4","description":"Recalculate fuel reserves based on a scenario provided by the evaluator"},
    {"code":"PA.I.D.S5","description":"Use an electronic flight bag (EFB), if applicable"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.I.E', 'private', 'Preflight Preparation', 'National Airspace System',
  $$[
    {"code":"PA.I.E.K1","description":"Airspace classes and associated requirements and limitations"},
    {"code":"PA.I.E.K2","description":"Chart symbols"},
    {"code":"PA.I.E.K3","description":"Special use airspace (SUA), special flight rules areas (SFRA), temporary flight restrictions (TFR), and other airspace areas"},
    {"code":"PA.I.E.K4","description":"Special visual flight rules (VFR) requirements"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.E.R1","description":"Various classes and types of airspace"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.E.S1","description":"Identify and comply with the requirements for basic VFR weather minimums and flying in particular classes of airspace"},
    {"code":"PA.I.E.S2","description":"Correctly identify airspace and operate in accordance with associated communication and equipment requirements"},
    {"code":"PA.I.E.S3","description":"Identify the requirements for operating in SUA or within a TFR. Identify and comply with special air traffic rules (SATR) and SFRA operations, if applicable"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.I.F', 'private', 'Preflight Preparation', 'Performance and Limitations',
  $$[
    {"code":"PA.I.F.K1","description":"Elements related to performance and limitations by explaining the use of charts, tables, and data to determine performance"},
    {"code":"PA.I.F.K2","description":"Factors affecting performance, including: atmospheric conditions, pilot technique, airplane configuration, airport environment, loading (e.g., center of gravity (CG)), weight and balance"},
    {"code":"PA.I.F.K3","description":"Aerodynamics"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.F.R1","description":"Use of performance charts, tables, and data"},
    {"code":"PA.I.F.R2","description":"Airplane limitations"},
    {"code":"PA.I.F.R3","description":"Possible differences between calculated performance and actual performance"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.F.S1","description":"Compute the weight and balance, correct out-of-CG loading errors, and determine if the weight and balance remains within limits during all phases of flight"},
    {"code":"PA.I.F.S2","description":"Use the appropriate airplane performance charts, tables, and data"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.I.G', 'private', 'Preflight Preparation', 'Operation of Systems',
  $$[
    {"code":"PA.I.G.K1","description":"Airplane systems, including: primary flight controls, secondary flight controls, powerplant and propeller, landing gear, fuel oil and hydraulic, electrical, avionics, pitot-static vacuum/pressure and associated flight instruments, environmental, deicing and anti-icing, water rudders (ASES, AMES), oxygen system"},
    {"code":"PA.I.G.K2","description":"Indications of and procedures for managing system abnormalities or failures"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.G.R1","description":"Detection of system malfunctions or failures"},
    {"code":"PA.I.G.R2","description":"Management of a system failure"},
    {"code":"PA.I.G.R3","description":"Monitoring and management of automated systems"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.G.S1","description":"Operate at least three of the systems listed in K1a through K1l appropriately"},
    {"code":"PA.I.G.S2","description":"Complete the appropriate checklist(s)"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.I.H', 'private', 'Preflight Preparation', 'Human Factors',
  $$[
    {"code":"PA.I.H.K1","description":"Symptoms, recognition, causes, effects, and corrective actions associated with aeromedical and physiological issues including: hypoxia, hyperventilation, middle ear and sinus problems, spatial disorientation, motion sickness, carbon monoxide poisoning, stress, fatigue, dehydration and nutrition, hypothermia, optical illusions, dissolved nitrogen in the bloodstream after scuba dives"},
    {"code":"PA.I.H.K2","description":"Regulations regarding use of alcohol and drugs"},
    {"code":"PA.I.H.K3","description":"Effects of alcohol, drugs, and over-the-counter medications"},
    {"code":"PA.I.H.K4","description":"Aeronautical Decision-Making (ADM) to include using Crew Resource Management (CRM) or Single-Pilot Resource Management (SRM), as appropriate"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.H.R1","description":"Aeromedical and physiological issues"},
    {"code":"PA.I.H.R2","description":"Hazardous attitudes"},
    {"code":"PA.I.H.R3","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.I.H.R4","description":"Confirmation and expectation bias"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.H.S1","description":"Associate the symptoms and effects for at least three of the conditions listed in K1a through K1l with the cause(s) and corrective action(s)"},
    {"code":"PA.I.H.S2","description":"Perform self-assessment, including fitness for flight and personal minimums, for actual flight or a scenario given by the evaluator"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.I.I', 'private', 'Preflight Preparation', 'Water and Seaplane Characteristics, Seaplane Bases, Maritime Rules, and Aids to Marine Navigation (ASES, AMES)',
  $$[
    {"code":"PA.I.I.K1","description":"The characteristics of a water surface as affected by features such as: size and location, protected and unprotected areas, surface wind, direction and strength of water current, floating and partially submerged debris, sandbars islands and shoals, vessel traffic and wakes, other characteristics specific to the area, direction and height of waves"},
    {"code":"PA.I.I.K2","description":"Float and hull construction and its effect on seaplane performance"},
    {"code":"PA.I.I.K3","description":"Causes of porpoising and skipping, and the pilot action needed to prevent or correct these occurrences"},
    {"code":"PA.I.I.K4","description":"How to locate and identify seaplane bases on charts or in directories"},
    {"code":"PA.I.I.K5","description":"Operating restrictions at various bases"},
    {"code":"PA.I.I.K6","description":"Right-of-way, steering, and sailing rules pertinent to seaplane operation"},
    {"code":"PA.I.I.K7","description":"Marine navigation aids such as buoys, beacons, lights, sound signals, and range markers"},
    {"code":"PA.I.I.K8","description":"Naval vessel protection zones"},
    {"code":"PA.I.I.K9","description":"No wake zones"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.I.R1","description":"Local conditions"},
    {"code":"PA.I.I.R2","description":"Impact of marine traffic"},
    {"code":"PA.I.I.R3","description":"Right-of-way and sailing rules pertinent to seaplane operations"},
    {"code":"PA.I.I.R4","description":"Limited services and assistance available at seaplane bases"}
  ]$$::jsonb,
  $$[
    {"code":"PA.I.I.S1","description":"Assess the water surface characteristics for the proposed flight"},
    {"code":"PA.I.I.S2","description":"Identify restrictions at local seaplane bases"},
    {"code":"PA.I.I.S3","description":"Identify marine navigation aids"},
    {"code":"PA.I.I.S4","description":"Describe correct right-of-way, steering, and sailing operations"},
    {"code":"PA.I.I.S5","description":"Explain how float and hull construction can affect seaplane performance"},
    {"code":"PA.I.I.S6","description":"Describe how to correct for porpoising and skipping"}
  ]$$::jsonb
);

-- ============================================================
-- AREA II: Preflight Procedures (6 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.II.A', 'private', 'Preflight Procedures', 'Preflight Assessment',
  $$[
    {"code":"PA.II.A.K1","description":"Pilot self-assessment"},
    {"code":"PA.II.A.K2","description":"Determining that the airplane to be used is appropriate and airworthy"},
    {"code":"PA.II.A.K3","description":"Airplane preflight inspection including: which items should be inspected, the reasons for checking each item, how to detect possible defects, the associated regulations"},
    {"code":"PA.II.A.K4","description":"Environmental factors including weather, terrain, route selection, and obstructions"}
  ]$$::jsonb,
  $$[
    {"code":"PA.II.A.R1","description":"Pilot"},
    {"code":"PA.II.A.R2","description":"Aircraft"},
    {"code":"PA.II.A.R3","description":"Environment (e.g., weather, airports, airspace, terrain, obstacles)"},
    {"code":"PA.II.A.R4","description":"External pressures"},
    {"code":"PA.II.A.R5","description":"Aviation security concerns"}
  ]$$::jsonb,
  $$[
    {"code":"PA.II.A.S1","description":"Inspect the airplane with reference to an appropriate checklist"},
    {"code":"PA.II.A.S2","description":"Verify the airplane is in condition for safe flight and conforms to its type design"},
    {"code":"PA.II.A.S3","description":"Perform self-assessment"},
    {"code":"PA.II.A.S4","description":"Continue to assess the environment for safe flight"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.II.B', 'private', 'Preflight Procedures', 'Flight Deck Management',
  $$[
    {"code":"PA.II.B.K1","description":"Passenger briefing requirements, including operation and required use of safety restraint systems"},
    {"code":"PA.II.B.K2","description":"Use of appropriate checklists"},
    {"code":"PA.II.B.K3","description":"Requirements for current and appropriate navigation data"},
    {"code":"PA.II.B.K4","description":"Securing items and cargo"}
  ]$$::jsonb,
  $$[
    {"code":"PA.II.B.R1","description":"Use of systems or equipment including automation and portable electronic devices"},
    {"code":"PA.II.B.R2","description":"Inoperative equipment"},
    {"code":"PA.II.B.R3","description":"Passenger distractions"}
  ]$$::jsonb,
  $$[
    {"code":"PA.II.B.S1","description":"Secure all items in the aircraft"},
    {"code":"PA.II.B.S2","description":"Conduct an appropriate passenger briefing, including identifying the PIC, use of safety belts, shoulder harnesses, doors, passenger conduct, sterile aircraft, propeller blade avoidance, and emergency procedures"},
    {"code":"PA.II.B.S3","description":"Properly program and manage the aircraft automation, as applicable"},
    {"code":"PA.II.B.S4","description":"Appropriately manage risks by utilizing ADM, including SRM/CRM"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.II.C', 'private', 'Preflight Procedures', 'Engine Starting',
  $$[
    {"code":"PA.II.C.K1","description":"Starting under various conditions"},
    {"code":"PA.II.C.K2","description":"Starting the engine(s) by use of external power"},
    {"code":"PA.II.C.K3","description":"Limitations associated with starting"},
    {"code":"PA.II.C.K4","description":"Conditions leading to and procedures for an aborted start"}
  ]$$::jsonb,
  $$[
    {"code":"PA.II.C.R1","description":"Propeller safety"}
  ]$$::jsonb,
  $$[
    {"code":"PA.II.C.S1","description":"Position the airplane properly considering structures, other aircraft, wind, and the safety of nearby persons and property"},
    {"code":"PA.II.C.S2","description":"Complete the appropriate checklist(s)"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.II.D', 'private', 'Preflight Procedures', 'Taxiing (ASEL, AMEL)',
  $$[
    {"code":"PA.II.D.K1","description":"Current airport aeronautical references and information resources such as the Chart Supplement, airport diagram, and NOTAMs"},
    {"code":"PA.II.D.K2","description":"Taxi instructions/clearances"},
    {"code":"PA.II.D.K3","description":"Airport markings, signs, and lights"},
    {"code":"PA.II.D.K4","description":"Visual indicators for wind"},
    {"code":"PA.II.D.K5","description":"Aircraft lighting, as appropriate"},
    {"code":"PA.II.D.K6","description":"Procedures for: appropriate flight deck activities prior to taxi including route planning and identifying the location of Hot Spots, radio communications at towered and nontowered airports, entering or crossing runways, night taxi operations, low visibility taxi operations"}
  ]$$::jsonb,
  $$[
    {"code":"PA.II.D.R1","description":"Activities and distractions"},
    {"code":"PA.II.D.R2","description":"Confirmation or expectation bias as related to taxi instructions"},
    {"code":"PA.II.D.R3","description":"A taxi route or departure runway change"},
    {"code":"PA.II.D.R4","description":"Runway incursion"}
  ]$$::jsonb,
  $$[
    {"code":"PA.II.D.S1","description":"Receive and correctly read back clearances/instructions, if applicable"},
    {"code":"PA.II.D.S2","description":"Use an airport diagram or taxi chart during taxi, if published, and maintain situational awareness"},
    {"code":"PA.II.D.S3","description":"Position the flight controls for the existing wind, if applicable"},
    {"code":"PA.II.D.S4","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.II.D.S5","description":"Perform a brake check immediately after the airplane begins moving"},
    {"code":"PA.II.D.S6","description":"Maintain positive control of the airplane during ground operations by controlling direction and speed without excessive use of brakes"},
    {"code":"PA.II.D.S7","description":"Comply with airport/taxiway markings, signals, and air traffic control (ATC) clearances and instructions"},
    {"code":"PA.II.D.S8","description":"Position the airplane properly relative to hold lines"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.II.E', 'private', 'Preflight Procedures', 'Taxiing and Sailing (ASES, AMES)',
  $$[
    {"code":"PA.II.E.K1","description":"Airport information resources including Chart Supplements, airport diagram, and appropriate references"},
    {"code":"PA.II.E.K2","description":"Taxi instructions/clearances"},
    {"code":"PA.II.E.K3","description":"Airport/seaplane base markings, signs, and lights"},
    {"code":"PA.II.E.K4","description":"Visual indicators for wind"},
    {"code":"PA.II.E.K5","description":"Airplane lighting"},
    {"code":"PA.II.E.K6","description":"Procedures for: appropriate flight deck activities during taxiing or sailing, radio communications at towered and nontowered seaplane bases"}
  ]$$::jsonb,
  $$[
    {"code":"PA.II.E.R1","description":"Activities and distractions"},
    {"code":"PA.II.E.R2","description":"Porpoising and skipping"},
    {"code":"PA.II.E.R3","description":"Low visibility taxi and sailing operations"},
    {"code":"PA.II.E.R4","description":"Other aircraft, vessels, and hazards"},
    {"code":"PA.II.E.R5","description":"Confirmation or expectation bias as related to taxi instructions"}
  ]$$::jsonb,
  $$[
    {"code":"PA.II.E.S1","description":"Receive and correctly read back clearances/instructions, if applicable"},
    {"code":"PA.II.E.S2","description":"Use an appropriate diagram during taxi, if published, and maintain situational awareness"},
    {"code":"PA.II.E.S3","description":"Position the flight controls for the existing wind and water conditions"},
    {"code":"PA.II.E.S4","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.II.E.S5","description":"Taxi or sail to the designated area for takeoff, considering wind direction and the presence of any aircraft, vessels, or buildings"},
    {"code":"PA.II.E.S6","description":"Maintain positive control of the airplane during ground and water operations"},
    {"code":"PA.II.E.S7","description":"Comply with seaplane base markings, signals, and ATC clearances and instructions"},
    {"code":"PA.II.E.S8","description":"Position the airplane properly for the existing conditions"},
    {"code":"PA.II.E.S9","description":"Demonstrate correct techniques for sailing, as appropriate"},
    {"code":"PA.II.E.S10","description":"Demonstrate correct techniques for docking, mooring, and ramping/beaching, as appropriate"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.II.F', 'private', 'Preflight Procedures', 'Before Takeoff Check',
  $$[
    {"code":"PA.II.F.K1","description":"Purpose of before takeoff checklist items including: reasons for checking each item, detecting malfunctions, ensuring the aircraft is in safe operating condition as recommended by the manufacturer"}
  ]$$::jsonb,
  $$[
    {"code":"PA.II.F.R1","description":"Division of attention while conducting before takeoff checks"},
    {"code":"PA.II.F.R2","description":"Unexpected runway changes by air traffic control (ATC)"},
    {"code":"PA.II.F.R3","description":"Wake turbulence"},
    {"code":"PA.II.F.R4","description":"Potential powerplant failure during takeoff or other malfunction considering operational factors"}
  ]$$::jsonb,
  $$[
    {"code":"PA.II.F.S1","description":"Review takeoff performance"},
    {"code":"PA.II.F.S2","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.II.F.S3","description":"Position the airplane appropriately considering wind direction and the presence of any aircraft, vessels, or buildings, as applicable"},
    {"code":"PA.II.F.S4","description":"Divide attention inside and outside the flight deck"},
    {"code":"PA.II.F.S5","description":"Verify that engine parameters and airplane configuration are suitable"}
  ]$$::jsonb
);

-- ============================================================
-- AREA III: Airport and Seaplane Base Operations (2 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.III.A', 'private', 'Airport and Seaplane Base Operations', 'Communications, Light Signals, and Runway Lighting Systems',
  $$[
    {"code":"PA.III.A.K1","description":"How to obtain appropriate radio frequencies"},
    {"code":"PA.III.A.K2","description":"Proper radio communication procedures and air traffic control (ATC) phraseology"},
    {"code":"PA.III.A.K3","description":"ATC light signal recognition"},
    {"code":"PA.III.A.K4","description":"Appropriate use of transponder(s)"},
    {"code":"PA.III.A.K5","description":"Lost communication procedures"},
    {"code":"PA.III.A.K6","description":"Equipment issues that could cause loss of communication"},
    {"code":"PA.III.A.K7","description":"Radar assistance"},
    {"code":"PA.III.A.K8","description":"National Transportation Safety Board (NTSB) accident/incident reporting"},
    {"code":"PA.III.A.K9","description":"Runway Status Lighting Systems"}
  ]$$::jsonb,
  $$[
    {"code":"PA.III.A.R1","description":"Communication"},
    {"code":"PA.III.A.R2","description":"Deciding if and when to declare an emergency"},
    {"code":"PA.III.A.R4","description":"Use of non-standard phraseology"}
  ]$$::jsonb,
  $$[
    {"code":"PA.III.A.S1","description":"Select and activate appropriate frequencies"},
    {"code":"PA.III.A.S2","description":"Transmit using standard phraseology and procedures as specified in the AIM and Pilot/Controller Glossary"},
    {"code":"PA.III.A.S3","description":"Acknowledge radio communications and comply with ATC instructions or as directed by the evaluator"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.III.B', 'private', 'Airport and Seaplane Base Operations', 'Traffic Patterns',
  $$[
    {"code":"PA.III.B.K1","description":"Towered and nontowered airport operations"},
    {"code":"PA.III.B.K2","description":"Traffic pattern selection for the current conditions"},
    {"code":"PA.III.B.K3","description":"Right-of-way rules"},
    {"code":"PA.III.B.K4","description":"Use of automated weather and airport information"}
  ]$$::jsonb,
  $$[
    {"code":"PA.III.B.R1","description":"Collision hazards"},
    {"code":"PA.III.B.R2","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.III.B.R3","description":"Windshear and wake turbulence"}
  ]$$::jsonb,
  $$[
    {"code":"PA.III.B.S1","description":"Identify and interpret airport/seaplane base runways, taxiways, markings, signs, and lighting"},
    {"code":"PA.III.B.S2","description":"Comply with recommended traffic pattern procedures"},
    {"code":"PA.III.B.S3","description":"Correct for wind drift to maintain the proper ground track"},
    {"code":"PA.III.B.S4","description":"Maintain orientation with the runway/landing area in use"},
    {"code":"PA.III.B.S5","description":"Maintain traffic pattern altitude +/-100 feet and the appropriate airspeed +/-10 knots"},
    {"code":"PA.III.B.S6","description":"Maintain situational awareness and proper spacing from other aircraft in the traffic pattern"}
  ]$$::jsonb
);

-- ============================================================
-- AREA IV: Takeoffs, Landings, and Go-Arounds (14 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IV.A', 'private', 'Takeoffs, Landings, and Go-Arounds', 'Normal Takeoff and Climb',
  $$[
    {"code":"PA.IV.A.K1","description":"Effects of atmospheric conditions, including wind, on takeoff and climb performance"},
    {"code":"PA.IV.A.K2","description":"Best angle of climb speed (Vx) and best rate of climb speed (Vy)"},
    {"code":"PA.IV.A.K3","description":"Appropriate airplane configuration"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.A.R1","description":"Selection of runway or takeoff path based on aircraft performance and limitations, available distance, and wind"},
    {"code":"PA.IV.A.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, takeoff surface/condition"},
    {"code":"PA.IV.A.R3","description":"Abnormal operations including planning for: rejected takeoff, potential engine failure in takeoff/climb phase of flight"},
    {"code":"PA.IV.A.R4","description":"Collision hazards"},
    {"code":"PA.IV.A.R5","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IV.A.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.IV.A.R7","description":"Runway incursion"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.A.S1","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IV.A.S2","description":"Make radio calls as appropriate"},
    {"code":"PA.IV.A.S3","description":"Verify assigned/correct runway or takeoff path"},
    {"code":"PA.IV.A.S4","description":"Ascertain wind direction with available information"},
    {"code":"PA.IV.A.S5","description":"Position the flight controls for the existing wind, if applicable"},
    {"code":"PA.IV.A.S6","description":"Clear the area, taxi into takeoff position, and align the airplane on the runway centerline or takeoff path"},
    {"code":"PA.IV.A.S7","description":"Confirm takeoff power and verify proper engine and flight instrument indications prior to rotation"},
    {"code":"PA.IV.A.S8","description":"Rotate and lift off at the recommended airspeed and accelerate to Vy"},
    {"code":"PA.IV.A.S9","description":"Establish a pitch attitude to maintain the manufacturer recommended speed or Vy +10/-5 knots"},
    {"code":"PA.IV.A.S10","description":"Configure the airplane in accordance with manufacturer guidance"},
    {"code":"PA.IV.A.S11","description":"Maintain Vy +10/-5 knots to a safe maneuvering altitude"},
    {"code":"PA.IV.A.S12","description":"Maintain directional control and proper wind-drift correction throughout takeoff and climb"},
    {"code":"PA.IV.A.S13","description":"Comply with noise abatement procedures, as applicable"},
    {"code":"PA.IV.A.S14","description":"Complete the appropriate checklist(s)"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IV.B', 'private', 'Takeoffs, Landings, and Go-Arounds', 'Normal Approach and Landing',
  $$[
    {"code":"PA.IV.B.K1","description":"A stabilized approach, including energy management concepts"},
    {"code":"PA.IV.B.K2","description":"Effects of atmospheric conditions, including wind, on approach and landing performance"},
    {"code":"PA.IV.B.K3","description":"Wind correction techniques on approach and landing"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.B.R1","description":"Selection of runway/landing surface, approach path, and touchdown area based on pilot capability, aircraft performance and limitations, available distance, and wind"},
    {"code":"PA.IV.B.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, landing surface/condition"},
    {"code":"PA.IV.B.R3","description":"Planning for: rejected landing and go-around, land and hold short operations (LAHSO)"},
    {"code":"PA.IV.B.R4","description":"Collision hazards"},
    {"code":"PA.IV.B.R5","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IV.B.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.B.S1","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IV.B.S2","description":"Make radio calls as appropriate"},
    {"code":"PA.IV.B.S3","description":"Ensure the airplane is aligned with the correct/assigned runway or landing surface"},
    {"code":"PA.IV.B.S4","description":"Scan the runway or landing surface and the adjoining area for traffic and obstructions"},
    {"code":"PA.IV.B.S5","description":"Select and aim for a suitable touchdown point considering the wind, landing surface, and obstructions"},
    {"code":"PA.IV.B.S6","description":"Establish the recommended approach and landing configuration, airspeed, and trim, and adjust as required"},
    {"code":"PA.IV.B.S7","description":"Maintain a stabilized approach and recommended airspeed, or in its absence not more than 1.3 Vso +10/-5 knots with gust factor applied"},
    {"code":"PA.IV.B.S8","description":"Maintain crosswind correction and directional control throughout the approach and landing"},
    {"code":"PA.IV.B.S9","description":"Make smooth, timely, and correct control application during round out and touchdown"},
    {"code":"PA.IV.B.S10","description":"Touch down at a proper pitch attitude within the available runway or landing area, at or within 400 feet beyond a specified point with no side drift, minimum float, and with the airplane longitudinal axis aligned with and over the runway centerline or landing path"},
    {"code":"PA.IV.B.S11","description":"Execute a timely go-around if the approach cannot be made within the tolerances specified above or for any other condition that may result in an unsafe approach or landing"},
    {"code":"PA.IV.B.S12","description":"Use runway incursion avoidance procedures, if applicable"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IV.C', 'private', 'Takeoffs, Landings, and Go-Arounds', 'Soft-Field Takeoff and Climb (ASEL)',
  $$[
    {"code":"PA.IV.C.K1","description":"Effects of atmospheric conditions, including wind, on takeoff and climb performance"},
    {"code":"PA.IV.C.K2","description":"Best angle of climb speed (Vx) and best rate of climb speed (Vy)"},
    {"code":"PA.IV.C.K3","description":"Appropriate airplane configuration for soft-field takeoff and climb"},
    {"code":"PA.IV.C.K4","description":"Effects of surface condition on airplane performance"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.C.R1","description":"Selection of runway or takeoff path based on aircraft performance and limitations, available distance, and wind"},
    {"code":"PA.IV.C.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, takeoff surface/condition"},
    {"code":"PA.IV.C.R3","description":"Abnormal operations including planning for: rejected takeoff, potential engine failure in takeoff/climb phase of flight"},
    {"code":"PA.IV.C.R4","description":"Collision hazards"},
    {"code":"PA.IV.C.R5","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IV.C.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.IV.C.R7","description":"Runway incursion"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.C.S1","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IV.C.S2","description":"Make radio calls as appropriate"},
    {"code":"PA.IV.C.S3","description":"Verify assigned/correct runway or takeoff path"},
    {"code":"PA.IV.C.S4","description":"Ascertain wind direction with available information"},
    {"code":"PA.IV.C.S5","description":"Position the flight controls for the existing wind and field conditions"},
    {"code":"PA.IV.C.S6","description":"Clear the area, taxi into takeoff position using manufacturer recommended procedure, and align the airplane on the runway centerline without stopping while advancing the throttle smoothly to takeoff power"},
    {"code":"PA.IV.C.S7","description":"Confirm takeoff power and verify proper engine and flight instrument indications prior to rotation"},
    {"code":"PA.IV.C.S8","description":"Establish and maintain a pitch attitude that transfers the weight of the airplane from the wheels to the wings as rapidly as possible"},
    {"code":"PA.IV.C.S9","description":"Lift off at the lowest possible airspeed and remain in ground effect while accelerating to Vx or Vy as appropriate"},
    {"code":"PA.IV.C.S10","description":"Establish a pitch attitude for Vy and accelerate to Vy +10/-5 knots after clearing any obstacle, or as recommended by the manufacturer"},
    {"code":"PA.IV.C.S11","description":"Configure the airplane in accordance with manufacturer guidance"},
    {"code":"PA.IV.C.S12","description":"Maintain Vy +10/-5 knots to a safe maneuvering altitude"},
    {"code":"PA.IV.C.S13","description":"Maintain directional control and proper wind-drift correction throughout takeoff and climb"},
    {"code":"PA.IV.C.S14","description":"Comply with noise abatement procedures, as applicable"},
    {"code":"PA.IV.C.S15","description":"Complete the appropriate checklist(s)"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IV.D', 'private', 'Takeoffs, Landings, and Go-Arounds', 'Soft-Field Approach and Landing (ASEL)',
  $$[
    {"code":"PA.IV.D.K1","description":"A stabilized approach, including energy management concepts"},
    {"code":"PA.IV.D.K2","description":"Effects of atmospheric conditions, including wind, on approach and landing performance"},
    {"code":"PA.IV.D.K3","description":"Wind correction techniques on approach and landing"},
    {"code":"PA.IV.D.K4","description":"Effects of surface condition on airplane performance"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.D.R1","description":"Selection of runway/landing surface, approach path, and touchdown area based on pilot capability, aircraft performance and limitations, available distance, and wind"},
    {"code":"PA.IV.D.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, landing surface/condition"},
    {"code":"PA.IV.D.R3","description":"Planning for: rejected landing and go-around"},
    {"code":"PA.IV.D.R4","description":"Collision hazards"},
    {"code":"PA.IV.D.R5","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IV.D.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.D.S1","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IV.D.S2","description":"Make radio calls as appropriate"},
    {"code":"PA.IV.D.S3","description":"Ensure the airplane is aligned with the correct/assigned runway or landing surface"},
    {"code":"PA.IV.D.S4","description":"Scan the runway or landing surface and the adjoining area for traffic and obstructions"},
    {"code":"PA.IV.D.S5","description":"Select and aim for a suitable touchdown point considering the wind, landing surface, and obstructions"},
    {"code":"PA.IV.D.S6","description":"Establish the recommended approach and landing configuration, airspeed, and trim, and adjust as required"},
    {"code":"PA.IV.D.S7","description":"Maintain a stabilized approach and recommended airspeed, or in its absence not more than 1.3 Vso +10/-5 knots with gust factor applied"},
    {"code":"PA.IV.D.S8","description":"Maintain crosswind correction and directional control throughout the approach and landing"},
    {"code":"PA.IV.D.S9","description":"Make smooth, timely, and correct control inputs during round out and touchdown"},
    {"code":"PA.IV.D.S10","description":"Touch down softly with no drift and with the airplane longitudinal axis aligned with the runway/landing path"},
    {"code":"PA.IV.D.S11","description":"Maintain elevator/elevator trim control to keep weight off the nosewheel throughout the landing roll"},
    {"code":"PA.IV.D.S12","description":"Execute a timely go-around if the approach cannot be made within the tolerances specified above or for any other condition that may result in an unsafe approach or landing"},
    {"code":"PA.IV.D.S13","description":"Use runway incursion avoidance procedures, if applicable"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IV.E', 'private', 'Takeoffs, Landings, and Go-Arounds', 'Short-Field Takeoff and Maximum Performance Climb (ASEL, AMEL)',
  $$[
    {"code":"PA.IV.E.K1","description":"Effects of atmospheric conditions, including wind, on takeoff and climb performance"},
    {"code":"PA.IV.E.K2","description":"Best angle of climb speed (Vx) and best rate of climb speed (Vy)"},
    {"code":"PA.IV.E.K3","description":"Appropriate airplane configuration for short-field takeoff and maximum performance climb"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.E.R1","description":"Selection of runway or takeoff path based on aircraft performance and limitations, available distance, and wind"},
    {"code":"PA.IV.E.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, takeoff surface/condition"},
    {"code":"PA.IV.E.R3","description":"Abnormal operations including planning for: rejected takeoff, potential engine failure in takeoff/climb phase of flight"},
    {"code":"PA.IV.E.R4","description":"Collision hazards"},
    {"code":"PA.IV.E.R5","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IV.E.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.IV.E.R7","description":"Runway incursion"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.E.S1","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IV.E.S2","description":"Make radio calls as appropriate"},
    {"code":"PA.IV.E.S3","description":"Verify assigned/correct runway or takeoff path"},
    {"code":"PA.IV.E.S4","description":"Ascertain wind direction with available information"},
    {"code":"PA.IV.E.S5","description":"Position the flight controls for the existing wind"},
    {"code":"PA.IV.E.S6","description":"Clear the area, taxi into takeoff position utilizing maximum available takeoff area, and align the airplane on the runway centerline"},
    {"code":"PA.IV.E.S7","description":"Apply brakes while advancing the throttle smoothly to takeoff power and verify proper engine and flight instrument indications prior to brake release"},
    {"code":"PA.IV.E.S8","description":"Rotate and lift off at the recommended airspeed and accelerate to the recommended obstacle clearance airspeed or Vx"},
    {"code":"PA.IV.E.S9","description":"Establish a pitch attitude for Vx or the recommended obstacle clearance airspeed +10/-5 knots until the obstacle is cleared, or until the airplane is 50 feet above the surface"},
    {"code":"PA.IV.E.S10","description":"After clearing the obstacle, establish a pitch attitude for Vy, accelerate to Vy, and maintain Vy +10/-5 knots"},
    {"code":"PA.IV.E.S11","description":"Configure the airplane in accordance with manufacturer guidance"},
    {"code":"PA.IV.E.S12","description":"Maintain directional control and proper wind-drift correction throughout takeoff and climb"},
    {"code":"PA.IV.E.S13","description":"Comply with noise abatement procedures, as applicable"},
    {"code":"PA.IV.E.S14","description":"Complete the appropriate checklist(s)"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IV.F', 'private', 'Takeoffs, Landings, and Go-Arounds', 'Short-Field Approach and Landing (ASEL, AMEL)',
  $$[
    {"code":"PA.IV.F.K1","description":"A stabilized approach, including energy management concepts"},
    {"code":"PA.IV.F.K2","description":"Effects of atmospheric conditions, including wind, on approach and landing performance"},
    {"code":"PA.IV.F.K3","description":"Wind correction techniques on approach and landing"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.F.R1","description":"Selection of runway/landing surface, approach path, and touchdown area based on pilot capability, aircraft performance and limitations, available distance, and wind"},
    {"code":"PA.IV.F.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, landing surface/condition"},
    {"code":"PA.IV.F.R3","description":"Planning for: rejected landing and go-around"},
    {"code":"PA.IV.F.R4","description":"Collision hazards"},
    {"code":"PA.IV.F.R5","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IV.F.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.F.S1","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IV.F.S2","description":"Make radio calls as appropriate"},
    {"code":"PA.IV.F.S3","description":"Ensure the airplane is aligned with the correct/assigned runway or landing surface"},
    {"code":"PA.IV.F.S4","description":"Scan the runway or landing surface and the adjoining area for traffic and obstructions"},
    {"code":"PA.IV.F.S5","description":"Select and aim for a suitable touchdown point considering the wind, landing surface, and obstructions"},
    {"code":"PA.IV.F.S6","description":"Establish the recommended approach and landing configuration, airspeed, and trim, and adjust as required"},
    {"code":"PA.IV.F.S7","description":"Maintain a stabilized approach and recommended airspeed, or in its absence not more than 1.3 Vso +10/-5 knots with gust factor applied"},
    {"code":"PA.IV.F.S8","description":"Maintain crosswind correction and directional control throughout the approach and landing"},
    {"code":"PA.IV.F.S9","description":"Make smooth, timely, and correct control inputs during round out and touchdown"},
    {"code":"PA.IV.F.S10","description":"Touch down at a proper pitch attitude within the available runway or landing area, at or within 200 feet beyond a specified point with no side drift and with the airplane longitudinal axis aligned with and over the runway centerline or landing path"},
    {"code":"PA.IV.F.S11","description":"Use manufacturer recommended braking technique, as appropriate, to reduce speed and stop in the shortest distance consistent with safety"},
    {"code":"PA.IV.F.S12","description":"Execute a timely go-around if the approach cannot be made within the tolerances specified above or for any other condition that may result in an unsafe approach or landing"},
    {"code":"PA.IV.F.S13","description":"Use runway incursion avoidance procedures, if applicable"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IV.G', 'private', 'Takeoffs, Landings, and Go-Arounds', 'Confined Area Takeoff and Maximum Performance Climb (ASES, AMES)',
  $$[
    {"code":"PA.IV.G.K1","description":"Effects of atmospheric conditions, including wind, on takeoff and climb performance"},
    {"code":"PA.IV.G.K2","description":"Best angle of climb speed (Vx) and best rate of climb speed (Vy)"},
    {"code":"PA.IV.G.K3","description":"Appropriate airplane configuration for confined area takeoff and maximum performance climb"},
    {"code":"PA.IV.G.K4","description":"Effects of water surface on airplane performance"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.G.R1","description":"Selection of takeoff path based on aircraft performance and limitations, available distance, and wind"},
    {"code":"PA.IV.G.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, water surface/condition"},
    {"code":"PA.IV.G.R3","description":"Abnormal operations including planning for: rejected takeoff, potential engine failure in takeoff/climb phase of flight"},
    {"code":"PA.IV.G.R4","description":"Collision hazards including other aircraft, vessels, and obstacles"},
    {"code":"PA.IV.G.R5","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IV.G.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.G.S1","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IV.G.S2","description":"Make radio calls as appropriate"},
    {"code":"PA.IV.G.S3","description":"Verify the takeoff path is clear of hazards"},
    {"code":"PA.IV.G.S4","description":"Ascertain wind direction with available information"},
    {"code":"PA.IV.G.S5","description":"Position the flight controls for the existing wind and water conditions"},
    {"code":"PA.IV.G.S6","description":"Clear the area, position the airplane for maximum utilization of available takeoff area, and smoothly apply takeoff power"},
    {"code":"PA.IV.G.S7","description":"Rotate and lift off at the recommended airspeed and accelerate to Vx or the recommended obstacle clearance airspeed"},
    {"code":"PA.IV.G.S8","description":"Establish a pitch attitude for the recommended obstacle clearance airspeed or Vx +10/-5 knots until the obstacle is cleared"},
    {"code":"PA.IV.G.S9","description":"After clearing the obstacle, establish Vy and maintain Vy +10/-5 knots"},
    {"code":"PA.IV.G.S10","description":"Maintain directional control and proper wind-drift correction throughout takeoff and climb"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IV.H', 'private', 'Takeoffs, Landings, and Go-Arounds', 'Confined Area Approach and Landing (ASES, AMES)',
  $$[
    {"code":"PA.IV.H.K1","description":"A stabilized approach, including energy management concepts"},
    {"code":"PA.IV.H.K2","description":"Effects of atmospheric conditions, including wind, on approach and landing performance"},
    {"code":"PA.IV.H.K3","description":"Wind correction techniques on approach and landing"},
    {"code":"PA.IV.H.K4","description":"Effects of water surface on airplane performance"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.H.R1","description":"Selection of landing surface, approach path, and touchdown area based on pilot capability, aircraft performance and limitations, available distance, and wind"},
    {"code":"PA.IV.H.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, water surface/condition"},
    {"code":"PA.IV.H.R3","description":"Planning for: rejected landing and go-around"},
    {"code":"PA.IV.H.R4","description":"Collision hazards including other aircraft, vessels, and obstacles"},
    {"code":"PA.IV.H.R5","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IV.H.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.H.S1","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IV.H.S2","description":"Make radio calls as appropriate"},
    {"code":"PA.IV.H.S3","description":"Ensure the airplane is aligned with the correct/assigned landing area"},
    {"code":"PA.IV.H.S4","description":"Scan the landing surface and the adjoining area for traffic, vessels, and obstructions"},
    {"code":"PA.IV.H.S5","description":"Select and aim for a suitable touchdown point considering the wind, landing surface, and obstructions"},
    {"code":"PA.IV.H.S6","description":"Establish the recommended approach and landing configuration, airspeed, and trim, and adjust as required"},
    {"code":"PA.IV.H.S7","description":"Maintain a stabilized approach and recommended airspeed, or in its absence not more than 1.3 Vso +10/-5 knots with gust factor applied"},
    {"code":"PA.IV.H.S8","description":"Maintain crosswind correction and directional control throughout the approach and landing"},
    {"code":"PA.IV.H.S9","description":"Make smooth, timely, and correct control inputs during round out and touchdown"},
    {"code":"PA.IV.H.S10","description":"Touch down at a proper pitch attitude at or within 200 feet beyond a specified point with the airplane longitudinal axis aligned with the landing path"},
    {"code":"PA.IV.H.S11","description":"Execute a timely go-around if the approach cannot be made within the tolerances specified above or for any other condition that may result in an unsafe approach or landing"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IV.I', 'private', 'Takeoffs, Landings, and Go-Arounds', 'Glassy Water Takeoff and Climb (ASES, AMES)',
  $$[
    {"code":"PA.IV.I.K1","description":"Effects of atmospheric conditions, including wind, on takeoff and climb performance"},
    {"code":"PA.IV.I.K2","description":"Best angle of climb speed (Vx) and best rate of climb speed (Vy)"},
    {"code":"PA.IV.I.K3","description":"Appropriate airplane configuration for glassy water takeoff"},
    {"code":"PA.IV.I.K4","description":"Appropriate techniques for glassy water conditions, including visual references and pitch attitude"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.I.R1","description":"Selection of takeoff path based on aircraft performance and limitations, available distance, and glassy water conditions"},
    {"code":"PA.IV.I.R2","description":"Effects of glassy water on airplane performance and pilot perception"},
    {"code":"PA.IV.I.R3","description":"Abnormal operations including planning for: rejected takeoff, potential engine failure in takeoff/climb phase of flight"},
    {"code":"PA.IV.I.R4","description":"Collision hazards including submerged objects"},
    {"code":"PA.IV.I.R5","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IV.I.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.I.S1","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IV.I.S2","description":"Make radio calls as appropriate"},
    {"code":"PA.IV.I.S3","description":"Verify the takeoff path is clear of hazards"},
    {"code":"PA.IV.I.S4","description":"Position the flight controls and apply takeoff power using the appropriate technique for glassy water conditions"},
    {"code":"PA.IV.I.S5","description":"Establish and maintain an appropriate planing attitude, lift off, and remain in ground effect while accelerating"},
    {"code":"PA.IV.I.S6","description":"Establish Vy and maintain Vy +10/-5 knots during the climb"},
    {"code":"PA.IV.I.S7","description":"Maintain directional control throughout takeoff and climb"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IV.J', 'private', 'Takeoffs, Landings, and Go-Arounds', 'Glassy Water Approach and Landing (ASES, AMES)',
  $$[
    {"code":"PA.IV.J.K1","description":"A stabilized approach, including energy management concepts"},
    {"code":"PA.IV.J.K2","description":"Effects of atmospheric conditions on approach and landing performance"},
    {"code":"PA.IV.J.K3","description":"Appropriate techniques for glassy water conditions, including visual references and pitch attitude"},
    {"code":"PA.IV.J.K4","description":"Effects of glassy water on depth perception and pilot judgment"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.J.R1","description":"Selection of landing area, approach path, and touchdown area based on pilot capability, aircraft performance and limitations, available distance, and glassy water conditions"},
    {"code":"PA.IV.J.R2","description":"Effects of glassy water on airplane performance and pilot perception"},
    {"code":"PA.IV.J.R3","description":"Planning for: rejected landing and go-around"},
    {"code":"PA.IV.J.R4","description":"Collision hazards including submerged objects"},
    {"code":"PA.IV.J.R5","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IV.J.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.J.S1","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IV.J.S2","description":"Make radio calls as appropriate"},
    {"code":"PA.IV.J.S3","description":"Scan the landing area for traffic, vessels, and obstructions"},
    {"code":"PA.IV.J.S4","description":"Select a suitable landing area with appropriate references for glassy water conditions"},
    {"code":"PA.IV.J.S5","description":"Establish the recommended approach and landing configuration, airspeed, and trim"},
    {"code":"PA.IV.J.S6","description":"Maintain a stabilized approach using the appropriate glassy water technique"},
    {"code":"PA.IV.J.S7","description":"Maintain the proper pitch attitude and rate of descent through touchdown"},
    {"code":"PA.IV.J.S8","description":"Execute a timely go-around if the approach cannot be made safely"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IV.K', 'private', 'Takeoffs, Landings, and Go-Arounds', 'Rough Water Takeoff and Climb (ASES, AMES)',
  $$[
    {"code":"PA.IV.K.K1","description":"Effects of atmospheric conditions, including wind, on takeoff and climb performance"},
    {"code":"PA.IV.K.K2","description":"Best angle of climb speed (Vx) and best rate of climb speed (Vy)"},
    {"code":"PA.IV.K.K3","description":"Appropriate airplane configuration for rough water takeoff"},
    {"code":"PA.IV.K.K4","description":"Appropriate techniques for rough water conditions"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.K.R1","description":"Selection of takeoff path based on aircraft performance and limitations, available distance, wind, and water conditions"},
    {"code":"PA.IV.K.R2","description":"Effects of rough water on airplane performance and structural integrity"},
    {"code":"PA.IV.K.R3","description":"Abnormal operations including planning for: rejected takeoff, potential engine failure in takeoff/climb phase of flight"},
    {"code":"PA.IV.K.R4","description":"Collision hazards"},
    {"code":"PA.IV.K.R5","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IV.K.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.K.S1","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IV.K.S2","description":"Make radio calls as appropriate"},
    {"code":"PA.IV.K.S3","description":"Verify the takeoff path is clear of hazards"},
    {"code":"PA.IV.K.S4","description":"Ascertain wind direction and water conditions with available information"},
    {"code":"PA.IV.K.S5","description":"Position the flight controls and apply takeoff power using the appropriate technique for rough water conditions"},
    {"code":"PA.IV.K.S6","description":"Establish proper planing attitude and lift off at the appropriate airspeed"},
    {"code":"PA.IV.K.S7","description":"Establish Vy and maintain Vy +10/-5 knots during the climb"},
    {"code":"PA.IV.K.S8","description":"Maintain directional control throughout takeoff and climb"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IV.L', 'private', 'Takeoffs, Landings, and Go-Arounds', 'Rough Water Approach and Landing (ASES, AMES)',
  $$[
    {"code":"PA.IV.L.K1","description":"A stabilized approach, including energy management concepts"},
    {"code":"PA.IV.L.K2","description":"Effects of atmospheric conditions, including wind, on approach and landing performance"},
    {"code":"PA.IV.L.K3","description":"Wind correction techniques on approach and landing"},
    {"code":"PA.IV.L.K4","description":"Appropriate techniques for rough water conditions"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.L.R1","description":"Selection of landing area, approach path, and touchdown area based on pilot capability, aircraft performance and limitations, available distance, wind, and water conditions"},
    {"code":"PA.IV.L.R2","description":"Effects of rough water on airplane performance and structural integrity"},
    {"code":"PA.IV.L.R3","description":"Planning for: rejected landing and go-around"},
    {"code":"PA.IV.L.R4","description":"Collision hazards"},
    {"code":"PA.IV.L.R5","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IV.L.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.L.S1","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IV.L.S2","description":"Make radio calls as appropriate"},
    {"code":"PA.IV.L.S3","description":"Scan the landing area for traffic, vessels, and obstructions"},
    {"code":"PA.IV.L.S4","description":"Select a suitable landing area considering wind and water conditions"},
    {"code":"PA.IV.L.S5","description":"Establish the recommended approach and landing configuration, airspeed, and trim"},
    {"code":"PA.IV.L.S6","description":"Maintain a stabilized approach and recommended airspeed with gust factor applied"},
    {"code":"PA.IV.L.S7","description":"Maintain crosswind correction and directional control throughout the approach and landing"},
    {"code":"PA.IV.L.S8","description":"Touch down at a proper pitch attitude at the minimum safe airspeed using appropriate rough water technique"},
    {"code":"PA.IV.L.S9","description":"Execute a timely go-around if the approach cannot be made safely"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IV.M', 'private', 'Takeoffs, Landings, and Go-Arounds', 'Forward Slip to a Landing (ASEL, ASES)',
  $$[
    {"code":"PA.IV.M.K1","description":"Concepts of energy management during a forward slip approach"},
    {"code":"PA.IV.M.K2","description":"Effects of wind on ground track during a forward slip"},
    {"code":"PA.IV.M.K3","description":"Airplane limitations regarding forward slips including flap setting restrictions"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.M.R1","description":"Selection of runway/landing surface, approach path, and touchdown area based on pilot capability, aircraft performance and limitations, available distance, and wind"},
    {"code":"PA.IV.M.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, landing surface/condition"},
    {"code":"PA.IV.M.R3","description":"Planning for: rejected landing and go-around"},
    {"code":"PA.IV.M.R4","description":"Collision hazards"},
    {"code":"PA.IV.M.R5","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IV.M.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.M.S1","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IV.M.S2","description":"Make radio calls as appropriate"},
    {"code":"PA.IV.M.S3","description":"Ensure the airplane is aligned with the correct/assigned runway or landing surface"},
    {"code":"PA.IV.M.S4","description":"Establish a forward slip at a point from which a landing can be made using the recommended approach and landing configuration and airspeed"},
    {"code":"PA.IV.M.S5","description":"Maintain a ground track aligned with the runway centerline or landing path"},
    {"code":"PA.IV.M.S6","description":"Maintain the desired airspeed which allows for proper energy management to arrive at the desired touchdown point"},
    {"code":"PA.IV.M.S7","description":"Make smooth, timely, and correct control inputs to transition from the slip to a landing"},
    {"code":"PA.IV.M.S8","description":"Touch down at a proper pitch attitude with no side drift and with the airplane longitudinal axis aligned with the runway centerline or landing path"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IV.N', 'private', 'Takeoffs, Landings, and Go-Arounds', 'Go-Around/Rejected Landing',
  $$[
    {"code":"PA.IV.N.K1","description":"A stabilized approach, including energy management concepts"},
    {"code":"PA.IV.N.K2","description":"Effects of atmospheric conditions, including wind, on a go-around or rejected landing"},
    {"code":"PA.IV.N.K3","description":"Wind correction techniques on a go-around or rejected landing"},
    {"code":"PA.IV.N.K4","description":"Go-around/rejected landing procedures, including airplane configuration"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.N.R1","description":"Delayed recognition of the need for a go-around/rejected landing"},
    {"code":"PA.IV.N.R2","description":"Improper application of power during go-around"},
    {"code":"PA.IV.N.R3","description":"Collision hazards"},
    {"code":"PA.IV.N.R4","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IV.N.R5","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IV.N.S1","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IV.N.S2","description":"Make radio calls as appropriate"},
    {"code":"PA.IV.N.S3","description":"Make a timely decision to discontinue the approach to landing"},
    {"code":"PA.IV.N.S4","description":"Apply takeoff power immediately and transition to climb pitch attitude for Vy and maintain Vy +10/-5 knots"},
    {"code":"PA.IV.N.S5","description":"Configure the airplane as recommended by the manufacturer and target Vy"},
    {"code":"PA.IV.N.S6","description":"Maneuver to the side of the runway/landing area when necessary to clear and avoid conflicting traffic"},
    {"code":"PA.IV.N.S7","description":"Maintain directional control and proper wind-drift correction throughout the climb"},
    {"code":"PA.IV.N.S8","description":"Complete the appropriate checklist(s)"}
  ]$$::jsonb
);

-- ============================================================
-- AREA V: Performance Maneuvers and Ground Reference Maneuvers (2 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.V.A', 'private', 'Performance Maneuvers and Ground Reference Maneuvers', 'Steep Turns',
  $$[
    {"code":"PA.V.A.K1","description":"How to conduct a proper steep turn"},
    {"code":"PA.V.A.K2","description":"Aerodynamics associated with steep turns, including: maintaining coordinated flight, overbanking tendencies, maneuvering speed including the impact of weight changes, load factor and accelerated stalls, rate and radius of turn"}
  ]$$::jsonb,
  $$[
    {"code":"PA.V.A.R1","description":"Division of attention between aircraft control and orientation"},
    {"code":"PA.V.A.R2","description":"Collision hazards"},
    {"code":"PA.V.A.R3","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.V.A.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.V.A.R5","description":"Uncoordinated flight"}
  ]$$::jsonb,
  $$[
    {"code":"PA.V.A.S1","description":"Clear the area"},
    {"code":"PA.V.A.S2","description":"Establish the manufacturer recommended airspeed; or if one is not available, an airspeed not to exceed Va"},
    {"code":"PA.V.A.S3","description":"Roll into a coordinated 360-degree steep turn with approximately a 45-degree bank"},
    {"code":"PA.V.A.S4","description":"Perform the task in the opposite direction"},
    {"code":"PA.V.A.S5","description":"Maintain the entry altitude +/-100 feet, airspeed +/-10 knots, bank +/-5 degrees, and roll out on the entry heading +/-10 degrees"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.V.B', 'private', 'Performance Maneuvers and Ground Reference Maneuvers', 'Ground Reference Maneuvers',
  $$[
    {"code":"PA.V.B.K1","description":"Purpose of ground reference maneuvers"},
    {"code":"PA.V.B.K2","description":"Effects of wind on ground track and relation to a ground reference"},
    {"code":"PA.V.B.K3","description":"Effects of bank angle and groundspeed on rate and radius of turn"},
    {"code":"PA.V.B.K4","description":"Relationship of rectangular course to airport traffic pattern"}
  ]$$::jsonb,
  $$[
    {"code":"PA.V.B.R1","description":"Division of attention between aircraft control and orientation"},
    {"code":"PA.V.B.R2","description":"Collision hazards"},
    {"code":"PA.V.B.R3","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.V.B.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.V.B.R5","description":"Uncoordinated flight"}
  ]$$::jsonb,
  $$[
    {"code":"PA.V.B.S1","description":"Clear the area"},
    {"code":"PA.V.B.S2","description":"Select a suitable ground reference area, line, or point as appropriate"},
    {"code":"PA.V.B.S3","description":"Plan the maneuver considering wind direction, speed, and altitude"},
    {"code":"PA.V.B.S4","description":"Apply adequate wind-drift correction to maintain a constant ground track around a rectangular or circular ground reference area, a ## constant radius turn, or maintain a straight ground track over or along a ground reference line or point"},
    {"code":"PA.V.B.S5","description":"If performing rectangular course, apply wind-drift correction to maintain a constant distance from the selected reference area, not to exceed approximately 3/4 mile"},
    {"code":"PA.V.B.S6","description":"Divide attention between airplane control and the ground track and maintain coordinated flight"},
    {"code":"PA.V.B.S7","description":"Maintain altitude +/-100 feet and airspeed +/-10 knots"}
  ]$$::jsonb
);

-- ============================================================
-- AREA VI: Navigation (4 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.VI.A', 'private', 'Navigation', 'Pilotage and Dead Reckoning',
  $$[
    {"code":"PA.VI.A.K1","description":"Pilotage and dead reckoning"},
    {"code":"PA.VI.A.K2","description":"Magnetic compass errors"},
    {"code":"PA.VI.A.K3","description":"Topography"},
    {"code":"PA.VI.A.K4","description":"Selection of appropriate: route, altitude(s), checkpoints"},
    {"code":"PA.VI.A.K5","description":"Plotting a course, including: determining heading, speed, and course, wind correction angle, estimating time, speed, and distance, true airspeed and density altitude"},
    {"code":"PA.VI.A.K6","description":"Power setting selection"},
    {"code":"PA.VI.A.K7","description":"Planned calculations versus actual results and required corrections"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VI.A.R1","description":"Collision hazards"},
    {"code":"PA.VI.A.R2","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.VI.A.R3","description":"Unplanned fuel/power consumption, if applicable"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VI.A.S1","description":"Prepare and use a navigation plan"},
    {"code":"PA.VI.A.S2","description":"Correctly identify landmarks by relating surface features to chart symbols"},
    {"code":"PA.VI.A.S3","description":"Navigate by means of pre-computed headings, groundspeeds, and elapsed time"},
    {"code":"PA.VI.A.S4","description":"Use the magnetic direction indicator in navigation, to include turns to headings"},
    {"code":"PA.VI.A.S5","description":"Verify the airplane position within 3 nautical miles of the flight-planned route"},
    {"code":"PA.VI.A.S6","description":"Arrive at the en route checkpoints within 5 minutes of the initial or revised estimated time of arrival (ETA) and provide a remaining fuel estimate"},
    {"code":"PA.VI.A.S7","description":"Correct for and record the differences between preflight fuel, groundspeed, and heading calculations and those determined en route"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.VI.B', 'private', 'Navigation', 'Navigation Systems and Radar Services',
  $$[
    {"code":"PA.VI.B.K1","description":"Ground-based navigation (identification, orientation, course determination, equipment tests, regulations, interference, appropriate use of navigation data, and signal integrity)"},
    {"code":"PA.VI.B.K2","description":"Satellite-based navigation (e.g., equipment, regulations, authorized use of databases, and Receiver Autonomous Integrity Monitoring (RAIM))"},
    {"code":"PA.VI.B.K3","description":"Radar assistance to visual flight rules (VFR) aircraft (e.g., operations, equipment available, services, traffic advisories)"},
    {"code":"PA.VI.B.K4","description":"Transponder (Mode(s) A, C, and S) and Automatic Dependent Surveillance-Broadcast (ADS-B)"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VI.B.R1","description":"Management of automated navigation and autoflight systems"},
    {"code":"PA.VI.B.R2","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.VI.B.R3","description":"Limitations of the navigation system in use"},
    {"code":"PA.VI.B.R4","description":"Loss of a navigation signal"},
    {"code":"PA.VI.B.R5","description":"Use of an electronic flight bag (EFB), if used"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VI.B.S1","description":"Use at least two navigation sources to navigate to the destination"},
    {"code":"PA.VI.B.S2","description":"Correctly identify and use the selected navigation source(s)"},
    {"code":"PA.VI.B.S3","description":"Correctly set and verify the navigation system course/bearing"},
    {"code":"PA.VI.B.S4","description":"Determine the airplane position relative to the navigation source(s)"},
    {"code":"PA.VI.B.S5","description":"Intercept and track a given course, radial, or bearing"},
    {"code":"PA.VI.B.S6","description":"Recognize and describe the indication of station or waypoint passage"},
    {"code":"PA.VI.B.S7","description":"Recognize signal loss, or navigation system or facility failure, and take appropriate action"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.VI.C', 'private', 'Navigation', 'Diversion',
  $$[
    {"code":"PA.VI.C.K1","description":"Selecting an alternate destination"},
    {"code":"PA.VI.C.K2","description":"Situations that require deviations from flight plan or air traffic control (ATC) instructions"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VI.C.R1","description":"Collision hazards"},
    {"code":"PA.VI.C.R2","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.VI.C.R3","description":"Circumstances that would make diversion prudent"},
    {"code":"PA.VI.C.R4","description":"Selecting an appropriate airport or seaplane base"},
    {"code":"PA.VI.C.R5","description":"Using available resources (e.g., automation, ATC, and flight deck planning aids)"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VI.C.S1","description":"Select a suitable destination and route for diversion"},
    {"code":"PA.VI.C.S2","description":"Make a reasonable estimate of heading, groundspeed, arrival time, and fuel required to the diversion airport or seaplane base"},
    {"code":"PA.VI.C.S3","description":"Maintain safe altitude and visibility requirements"},
    {"code":"PA.VI.C.S4","description":"Update/amend flight plan and make appropriate radio calls, as applicable"},
    {"code":"PA.VI.C.S5","description":"Use navigation systems/facilities and/or visual pilotage as appropriate"},
    {"code":"PA.VI.C.S6","description":"Describe how to use available automated systems appropriately"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.VI.D', 'private', 'Navigation', 'Lost Procedures',
  $$[
    {"code":"PA.VI.D.K1","description":"Methods to determine position"},
    {"code":"PA.VI.D.K2","description":"Assistance available if lost (e.g., radar services, communication procedures)"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VI.D.R1","description":"Collision hazards"},
    {"code":"PA.VI.D.R2","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.VI.D.R3","description":"Recording times over waypoints"},
    {"code":"PA.VI.D.R4","description":"When to seek assistance or declare an emergency in a deteriorating situation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VI.D.S1","description":"Maintain safe altitude and visibility requirements"},
    {"code":"PA.VI.D.S2","description":"Attempt to identify position using available resources"},
    {"code":"PA.VI.D.S3","description":"Identify and fly to the nearest concentration of prominent landmarks"},
    {"code":"PA.VI.D.S4","description":"Use available navigation aids and contact ATC for assistance, as appropriate"},
    {"code":"PA.VI.D.S5","description":"Plan a precautionary landing if deteriorating visibility and/or fuel exhaustion is imminent"}
  ]$$::jsonb
);

-- ============================================================
-- AREA VII: Slow Flight and Stalls (4 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.VII.A', 'private', 'Slow Flight and Stalls', 'Maneuvering During Slow Flight',
  $$[
    {"code":"PA.VII.A.K1","description":"Aerodynamics associated with slow flight in various airplane configurations, including the relationship between angle of attack, airspeed, load factor, power setting, airplane weight and center of gravity, airplane attitude, and yaw effects"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VII.A.R1","description":"Inadvertent slow flight and target flight with a stall warning, which could lead to loss of control"},
    {"code":"PA.VII.A.R2","description":"Range and limitations of stall warning indicators"},
    {"code":"PA.VII.A.R3","description":"Uncoordinated flight"},
    {"code":"PA.VII.A.R4","description":"Effect of environmental elements on airplane performance"},
    {"code":"PA.VII.A.R5","description":"Collision hazards"},
    {"code":"PA.VII.A.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VII.A.S1","description":"Clear the area"},
    {"code":"PA.VII.A.S2","description":"Select an entry altitude that allows the task to be completed no lower than 1,500 feet AGL"},
    {"code":"PA.VII.A.S3","description":"Establish and maintain an airspeed at which any further increase in angle of attack, increase in load factor, or reduction in power would result in a stall warning"},
    {"code":"PA.VII.A.S4","description":"Accomplish coordinated straight-and-level flight, turns, climbs, and descents with the airplane configured as specified by the evaluator without a stall warning"},
    {"code":"PA.VII.A.S5","description":"Maintain the specified altitude +/-50 feet, specified heading +/-10 degrees, airspeed +5/-0 knots above the speed at which a stall warning occurs, and specified bank angle +/-5 degrees"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.VII.B', 'private', 'Slow Flight and Stalls', 'Power-Off Stalls',
  $$[
    {"code":"PA.VII.B.K1","description":"Aerodynamics associated with stalls in various airplane configurations, including the relationship between angle of attack, airspeed, load factor, power setting, airplane weight and center of gravity, airplane attitude, and yaw effects"},
    {"code":"PA.VII.B.K2","description":"Stall characteristics as they relate to airplane design, and recognition of impending stall and full stall indications using sight, sound, or feel"},
    {"code":"PA.VII.B.K3","description":"Factors and situations that can lead to a power-off stall and actions that can be taken to prevent it"},
    {"code":"PA.VII.B.K4","description":"Fundamentals of stall recovery"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VII.B.R1","description":"Factors and situations that could lead to an inadvertent power-off stall, spin, and loss of control"},
    {"code":"PA.VII.B.R2","description":"Range and limitations of stall warning indicators"},
    {"code":"PA.VII.B.R3","description":"Stall warning(s) during normal operations"},
    {"code":"PA.VII.B.R4","description":"Stall recovery procedure"},
    {"code":"PA.VII.B.R5","description":"Secondary stalls, accelerated stalls, and cross-control stalls"},
    {"code":"PA.VII.B.R6","description":"Effect of environmental elements on airplane performance related to power-off stalls"},
    {"code":"PA.VII.B.R7","description":"Collision hazards"},
    {"code":"PA.VII.B.R8","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VII.B.S1","description":"Clear the area"},
    {"code":"PA.VII.B.S2","description":"Select an entry altitude that allows the task to be completed no lower than 1,500 feet AGL"},
    {"code":"PA.VII.B.S3","description":"Configure the airplane in the approach or landing configuration, as specified by the evaluator, and slow to a speed below the normal approach speed"},
    {"code":"PA.VII.B.S4","description":"Set power as specified by the evaluator"},
    {"code":"PA.VII.B.S5","description":"Transition smoothly from the approach or landing attitude to a pitch attitude that induces a stall"},
    {"code":"PA.VII.B.S6","description":"Maintain a specified heading +/-10 degrees if in straight flight; maintain a specified bank angle +/-10 degrees if in turning flight, while inducing the stall"},
    {"code":"PA.VII.B.S7","description":"Acknowledge cues of the impending stall and then recover promptly after a full stall occurs"},
    {"code":"PA.VII.B.S8","description":"Execute a stall recovery in accordance with procedures set forth in the Airplane Flying Handbook"},
    {"code":"PA.VII.B.S9","description":"Configure the airplane as recommended by the manufacturer, and target Vy +/-10 knots"},
    {"code":"PA.VII.B.S10","description":"Return to the altitude, heading, and airspeed specified by the evaluator"},
    {"code":"PA.VII.B.S11","description":"Complete the appropriate checklist(s)"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.VII.C', 'private', 'Slow Flight and Stalls', 'Power-On Stalls',
  $$[
    {"code":"PA.VII.C.K1","description":"Aerodynamics associated with stalls in various airplane configurations, including the relationship between angle of attack, airspeed, load factor, power setting, airplane weight and center of gravity, airplane attitude, and yaw effects"},
    {"code":"PA.VII.C.K2","description":"Stall characteristics as they relate to airplane design, and recognition of impending stall and full stall indications using sight, sound, or feel"},
    {"code":"PA.VII.C.K3","description":"Factors and situations that can lead to a power-on stall and actions that can be taken to prevent it"},
    {"code":"PA.VII.C.K4","description":"Fundamentals of stall recovery"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VII.C.R1","description":"Factors and situations that could lead to an inadvertent power-on stall, spin, and loss of control"},
    {"code":"PA.VII.C.R2","description":"Range and limitations of stall warning indicators"},
    {"code":"PA.VII.C.R3","description":"Stall warning(s) during normal operations"},
    {"code":"PA.VII.C.R4","description":"Stall recovery procedure"},
    {"code":"PA.VII.C.R5","description":"Secondary stalls, accelerated stalls, elevator trim stalls, and cross-control stalls"},
    {"code":"PA.VII.C.R6","description":"Effect of environmental elements on airplane performance related to power-on stalls"},
    {"code":"PA.VII.C.R7","description":"Collision hazards"},
    {"code":"PA.VII.C.R8","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VII.C.S1","description":"Clear the area"},
    {"code":"PA.VII.C.S2","description":"Select an entry altitude that allows the task to be completed no lower than 1,500 feet AGL"},
    {"code":"PA.VII.C.S3","description":"Configure the airplane in the takeoff configuration, as specified by the evaluator, and slow to lift-off speed"},
    {"code":"PA.VII.C.S4","description":"Set power as specified by the evaluator"},
    {"code":"PA.VII.C.S5","description":"Transition smoothly from the takeoff or departure attitude to the pitch attitude that induces a stall"},
    {"code":"PA.VII.C.S6","description":"Maintain a specified heading +/-10 degrees if in straight flight; maintain a specified bank angle +/-10 degrees if in turning flight, while inducing the stall"},
    {"code":"PA.VII.C.S7","description":"Acknowledge cues of the impending stall and then recover promptly after a full stall occurs"},
    {"code":"PA.VII.C.S8","description":"Execute a stall recovery in accordance with procedures set forth in the Airplane Flying Handbook"},
    {"code":"PA.VII.C.S9","description":"Configure the airplane as recommended by the manufacturer, and target Vy +/-10 knots"},
    {"code":"PA.VII.C.S10","description":"Return to the altitude, heading, and airspeed specified by the evaluator"},
    {"code":"PA.VII.C.S11","description":"Complete the appropriate checklist(s)"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.VII.D', 'private', 'Slow Flight and Stalls', 'Spin Awareness',
  $$[
    {"code":"PA.VII.D.K1","description":"Aerodynamics associated with spins in various airplane configurations, including the relationship between angle of attack, airspeed, load factor, power setting, airplane weight and center of gravity, airplane attitude, and yaw effects"},
    {"code":"PA.VII.D.K2","description":"What causes a spin and how to identify the entry, incipient, and developed phases of a spin"},
    {"code":"PA.VII.D.K3","description":"Spin recovery procedure"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VII.D.R1","description":"Factors and situations that could lead to inadvertent spin and loss of control"},
    {"code":"PA.VII.D.R2","description":"Range and limitations of stall warning indicators"},
    {"code":"PA.VII.D.R3","description":"Spin recovery procedure"},
    {"code":"PA.VII.D.R4","description":"Effect of environmental elements on airplane performance related to spins"},
    {"code":"PA.VII.D.R5","description":"Collision hazards"},
    {"code":"PA.VII.D.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  '[]'::jsonb
);

-- ============================================================
-- AREA VIII: Basic Instrument Maneuvers (6 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.VIII.A', 'private', 'Basic Instrument Maneuvers', 'Straight-and-Level Flight',
  $$[
    {"code":"PA.VIII.A.K1","description":"Flight instruments as they relate to: instrument limitations and potential errors, indication of the aircraft attitude, function and operation, proper instrument cross-check techniques"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VIII.A.R1","description":"Instrument flying hazards including failure to maintain VFR, spatial disorientation, loss of control, fatigue, stress, and emergency off-airport landings"},
    {"code":"PA.VIII.A.R2","description":"When to seek assistance or declare an emergency in a deteriorating situation"},
    {"code":"PA.VIII.A.R3","description":"Collision hazards"},
    {"code":"PA.VIII.A.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.VIII.A.R5","description":"Fixation and omission"},
    {"code":"PA.VIII.A.R6","description":"Instrument interpretation"},
    {"code":"PA.VIII.A.R7","description":"Control application solely by reference to instruments"},
    {"code":"PA.VIII.A.R8","description":"Trimming the aircraft"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VIII.A.S1","description":"Maintain straight-and-level flight using proper instrument cross-check and interpretation, and coordinated control application"},
    {"code":"PA.VIII.A.S2","description":"Maintain altitude +/-200 feet, heading +/-20 degrees, and airspeed +/-10 knots"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.VIII.B', 'private', 'Basic Instrument Maneuvers', 'Constant Airspeed Climbs',
  $$[
    {"code":"PA.VIII.B.K1","description":"Flight instruments as they relate to: instrument limitations and potential errors, indication of the aircraft attitude, function and operation, proper instrument cross-check techniques"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VIII.B.R1","description":"Instrument flying hazards including failure to maintain VFR, spatial disorientation, loss of control, fatigue, stress, and emergency off-airport landings"},
    {"code":"PA.VIII.B.R2","description":"When to seek assistance or declare an emergency in a deteriorating situation"},
    {"code":"PA.VIII.B.R3","description":"Collision hazards"},
    {"code":"PA.VIII.B.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.VIII.B.R5","description":"Fixation and omission"},
    {"code":"PA.VIII.B.R6","description":"Instrument interpretation"},
    {"code":"PA.VIII.B.R7","description":"Control application solely by reference to instruments"},
    {"code":"PA.VIII.B.R8","description":"Trimming the aircraft"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VIII.B.S1","description":"Transition to the climb pitch attitude and power setting on an assigned heading using proper instrument cross-check and interpretation, and coordinated flight control application"},
    {"code":"PA.VIII.B.S2","description":"Climb at a constant airspeed to specific altitudes in straight flight and turns"},
    {"code":"PA.VIII.B.S3","description":"Level off at the assigned altitude and maintain altitude +/-200 feet, heading +/-20 degrees, and airspeed +/-10 knots"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.VIII.C', 'private', 'Basic Instrument Maneuvers', 'Constant Airspeed Descents',
  $$[
    {"code":"PA.VIII.C.K1","description":"Flight instruments as they relate to: instrument limitations and potential errors, indication of the aircraft attitude, function and operation, proper instrument cross-check techniques"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VIII.C.R1","description":"Instrument flying hazards including failure to maintain VFR, spatial disorientation, loss of control, fatigue, stress, and emergency off-airport landings"},
    {"code":"PA.VIII.C.R2","description":"When to seek assistance or declare an emergency in a deteriorating situation"},
    {"code":"PA.VIII.C.R3","description":"Collision hazards"},
    {"code":"PA.VIII.C.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.VIII.C.R5","description":"Fixation and omission"},
    {"code":"PA.VIII.C.R6","description":"Instrument interpretation"},
    {"code":"PA.VIII.C.R7","description":"Control application solely by reference to instruments"},
    {"code":"PA.VIII.C.R8","description":"Trimming the aircraft"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VIII.C.S1","description":"Transition to the descent pitch attitude and power setting on an assigned heading using proper instrument cross-check and interpretation, and coordinated flight control application"},
    {"code":"PA.VIII.C.S2","description":"Descend at a constant airspeed to specific altitudes in straight flight and turns"},
    {"code":"PA.VIII.C.S3","description":"Level off at the assigned altitude and maintain altitude +/-200 feet, heading +/-20 degrees, and airspeed +/-10 knots"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.VIII.D', 'private', 'Basic Instrument Maneuvers', 'Turns to Headings',
  $$[
    {"code":"PA.VIII.D.K1","description":"Flight instruments as they relate to: instrument limitations and potential errors, indication of the aircraft attitude, function and operation, proper instrument cross-check techniques"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VIII.D.R1","description":"Instrument flying hazards including failure to maintain VFR, spatial disorientation, loss of control, fatigue, stress, and emergency off-airport landings"},
    {"code":"PA.VIII.D.R2","description":"When to seek assistance or declare an emergency in a deteriorating situation"},
    {"code":"PA.VIII.D.R3","description":"Collision hazards"},
    {"code":"PA.VIII.D.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.VIII.D.R5","description":"Fixation and omission"},
    {"code":"PA.VIII.D.R6","description":"Instrument interpretation"},
    {"code":"PA.VIII.D.R7","description":"Control application solely by reference to instruments"},
    {"code":"PA.VIII.D.R8","description":"Trimming the aircraft"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VIII.D.S1","description":"Turn to headings, maintain altitude +/-200 feet, maintain a standard rate turn, roll out on the assigned heading +/-10 degrees, and maintain airspeed +/-10 knots"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.VIII.E', 'private', 'Basic Instrument Maneuvers', 'Recovery from Unusual Flight Attitudes',
  $$[
    {"code":"PA.VIII.E.K1","description":"Prevention of unusual attitudes including flight causal, physiological, and environmental factors, and system and equipment failures"},
    {"code":"PA.VIII.E.K2","description":"Procedures for recovery from unusual attitudes in flight"},
    {"code":"PA.VIII.E.K3","description":"Procedures available to safely regain VMC after flight into inadvertent instrument meteorological conditions or unintended instrument meteorological conditions (IIMC/UIMC)"},
    {"code":"PA.VIII.E.K4","description":"Appropriate use of automation, if applicable"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VIII.E.R1","description":"Situations that could lead to loss of control in-flight (LOC-I) or unusual attitudes in-flight"},
    {"code":"PA.VIII.E.R3","description":"Collision hazards"},
    {"code":"PA.VIII.E.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.VIII.E.R5","description":"Interpreting flight instruments"},
    {"code":"PA.VIII.E.R7","description":"Operating envelope considerations"},
    {"code":"PA.VIII.E.R8","description":"Control input errors inducing undesired aircraft attitudes"},
    {"code":"PA.VIII.E.R9","description":"Assessment of the unusual attitude"},
    {"code":"PA.VIII.E.R10","description":"Control application solely by reference to instruments"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VIII.E.S1","description":"Use proper instrument cross-check and interpretation to identify an unusual attitude (including both nose-high and nose-low) in flight, and apply the appropriate flight control, power input, and aircraft configuration in the correct sequence to return to a stabilized level flight attitude"},
    {"code":"PA.VIII.E.S2","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.VIII.F', 'private', 'Basic Instrument Maneuvers', 'Radio Communications, Navigation Systems/Facilities, and Radar Services',
  $$[
    {"code":"PA.VIII.F.K1","description":"Operating communications equipment, including identifying and selecting radio frequencies, requesting and following air traffic control (ATC) instructions"},
    {"code":"PA.VIII.F.K2","description":"Operating navigation equipment, including functions and displays, and following bearings, radials, or courses"},
    {"code":"PA.VIII.F.K3","description":"Air traffic control facilities and services"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VIII.F.R1","description":"When to seek assistance or declare an emergency in a deteriorating situation"},
    {"code":"PA.VIII.F.R2","description":"Using available resources (e.g., automation, ATC, and flight deck planning aids)"}
  ]$$::jsonb,
  $$[
    {"code":"PA.VIII.F.S1","description":"Maintain airplane control while selecting proper communications frequencies, identifying the appropriate facility, and managing navigation equipment"},
    {"code":"PA.VIII.F.S2","description":"Comply with ATC instructions"}
  ]$$::jsonb
);

-- ============================================================
-- AREA IX: Emergency Operations (7 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IX.A', 'private', 'Emergency Operations', 'Emergency Descent',
  $$[
    {"code":"PA.IX.A.K1","description":"Situations that would require an emergency descent (e.g., depressurization, smoke, or engine fire)"},
    {"code":"PA.IX.A.K2","description":"Immediate action items and emergency procedures"},
    {"code":"PA.IX.A.K3","description":"Airspeed, including airspeed limitations"},
    {"code":"PA.IX.A.K4","description":"Aircraft performance and limitations"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IX.A.R1","description":"Altitude, wind, terrain, obstructions, gliding distance, and available landing distance considerations"},
    {"code":"PA.IX.A.R2","description":"Collision hazards"},
    {"code":"PA.IX.A.R3","description":"Configuring the airplane"},
    {"code":"PA.IX.A.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IX.A.S1","description":"Clear the area"},
    {"code":"PA.IX.A.S2","description":"Establish and maintain the appropriate airspeed and configuration for the emergency descent"},
    {"code":"PA.IX.A.S3","description":"Maintain orientation, divide attention appropriately, and plan and execute a smooth recovery"},
    {"code":"PA.IX.A.S4","description":"Use manufacturer recommended airspeed +/-10 knots, or if not available, not to exceed Vno or Vle as appropriate"},
    {"code":"PA.IX.A.S5","description":"Maintain bank angle between 30 and 45 degrees during the descent"},
    {"code":"PA.IX.A.S6","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IX.A.S7","description":"Level off at a specified altitude +/-100 feet"},
    {"code":"PA.IX.A.S8","description":"Demonstrate situational awareness throughout the maneuver"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IX.B', 'private', 'Emergency Operations', 'Emergency Approach and Landing (Simulated) (ASEL, ASES)',
  $$[
    {"code":"PA.IX.B.K1","description":"Immediate action items and emergency procedures"},
    {"code":"PA.IX.B.K2","description":"Airspeed, including: importance of best glide speed and its relationship to distance, difference between best glide speed and minimum sink speed, effects of wind on glide distance"},
    {"code":"PA.IX.B.K3","description":"Effects of atmospheric conditions on emergency approach and landing"},
    {"code":"PA.IX.B.K4","description":"A stabilized approach, including energy management concepts"},
    {"code":"PA.IX.B.K5","description":"Emergency Locator Transmitters (ELTs) and other emergency locating devices"},
    {"code":"PA.IX.B.K6","description":"Air traffic control (ATC) services to aircraft in distress"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IX.B.R1","description":"Altitude, wind, terrain, obstructions, and available landing area considerations"},
    {"code":"PA.IX.B.R2","description":"Collision hazards"},
    {"code":"PA.IX.B.R3","description":"Configuring the airplane"},
    {"code":"PA.IX.B.R4","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IX.B.R5","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.IX.B.R6","description":"Improper task management (e.g., attempting to restart the engine)"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IX.B.S1","description":"Establish and maintain the manufacturer recommended best glide airspeed, +/-10 knots"},
    {"code":"PA.IX.B.S2","description":"Configure the airplane"},
    {"code":"PA.IX.B.S3","description":"Select a suitable landing area considering altitude, wind, terrain, obstructions, and available landing area"},
    {"code":"PA.IX.B.S4","description":"Plan and follow a flight pattern to the selected landing area, considering altitude, wind, terrain, and obstructions"},
    {"code":"PA.IX.B.S5","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IX.B.S6","description":"Demonstrate situational awareness throughout the maneuver"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IX.C', 'private', 'Emergency Operations', 'Systems and Equipment Malfunctions',
  $$[
    {"code":"PA.IX.C.K1","description":"Causes of partial or complete power loss related to the specific type of powerplant(s)"},
    {"code":"PA.IX.C.K2","description":"System and equipment malfunctions specific to the aircraft, including: electrical malfunction, vacuum/pressure and associated flight instrument malfunctions, pitot-static system malfunction, electronic flight deck display malfunction, landing gear or flap malfunction, inoperative trim"},
    {"code":"PA.IX.C.K3","description":"Causes and remedies for smoke or fire onboard the aircraft"},
    {"code":"PA.IX.C.K4","description":"Any other system specific to the aircraft (e.g., supplemental oxygen, deicing)"},
    {"code":"PA.IX.C.K5","description":"Inadvertent door or window opening"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IX.C.R1","description":"Checklist usage for a system or equipment malfunction"},
    {"code":"PA.IX.C.R2","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.IX.C.R3","description":"Undesired aircraft state"},
    {"code":"PA.IX.C.R4","description":"Startle response"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IX.C.S1","description":"Determine appropriate action for simulated emergencies specified by the evaluator, from at least three of the elements or sub-elements listed in K1 through K5"},
    {"code":"PA.IX.C.S2","description":"Complete the appropriate checklist(s)"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IX.D', 'private', 'Emergency Operations', 'Emergency Equipment and Survival Gear',
  $$[
    {"code":"PA.IX.D.K1","description":"Emergency Locator Transmitter (ELT) operations, limitations, and testing requirements"},
    {"code":"PA.IX.D.K2","description":"Fire extinguisher operations and limitations"},
    {"code":"PA.IX.D.K3","description":"Emergency equipment and survival gear needed for: climate extremes (hot/cold), mountainous terrain, overwater operations"},
    {"code":"PA.IX.D.K4","description":"When to deploy a ballistic parachute and associated passenger briefings, if equipped"},
    {"code":"PA.IX.D.K5","description":"When to activate an emergency auto-land system and brief passengers, if equipped"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IX.D.R1","description":"Survival gear (water, clothing, shelter) for 48 to 72 hours"},
    {"code":"PA.IX.D.R2","description":"Use of a ballistic parachute system"},
    {"code":"PA.IX.D.R3","description":"Use of an emergency auto-land system, if installed"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IX.D.S1","description":"Identify appropriate equipment and personal gear"},
    {"code":"PA.IX.D.S2","description":"Brief passengers on proper use of on-board emergency equipment and survival gear"},
    {"code":"PA.IX.D.S3","description":"Simulate ballistic parachute deployment procedures, if equipped"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IX.E', 'private', 'Emergency Operations', 'Engine Failure During Takeoff Before Vmc (Simulated) (AMEL, AMES)',
  $$[
    {"code":"PA.IX.E.K1","description":"Factors affecting minimum control airspeed with an inoperative engine (Vmc)"},
    {"code":"PA.IX.E.K2","description":"Vmc (red line) and best single-engine rate of climb airspeed (Vyse) (blue line)"},
    {"code":"PA.IX.E.K3","description":"Accelerate/stop distance"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IX.E.R1","description":"Potential engine failure during takeoff"},
    {"code":"PA.IX.E.R2","description":"Configuring the airplane"},
    {"code":"PA.IX.E.R3","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IX.E.S1","description":"Close the throttles smoothly and promptly when a simulated engine failure occurs"},
    {"code":"PA.IX.E.S2","description":"Maintain directional control and apply brakes (AMEL) or flight controls (AMES), as necessary"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IX.F', 'private', 'Emergency Operations', 'Engine Failure After Liftoff (Simulated) (AMEL, AMES)',
  $$[
    {"code":"PA.IX.F.K1","description":"Factors affecting Vmc"},
    {"code":"PA.IX.F.K2","description":"Vmc (red line), Vyse (blue line), and Vsse (safe single-engine speed)"},
    {"code":"PA.IX.F.K3","description":"Accelerate/go distance"},
    {"code":"PA.IX.F.K4","description":"Engine failure during takeoff/climb phase procedures"},
    {"code":"PA.IX.F.K5","description":"Single-engine go-around procedures"},
    {"code":"PA.IX.F.K6","description":"Effects of density altitude on Vmc and single-engine performance"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IX.F.R1","description":"Potential engine failure after liftoff"},
    {"code":"PA.IX.F.R2","description":"Collision hazards"},
    {"code":"PA.IX.F.R3","description":"Configuring the airplane"},
    {"code":"PA.IX.F.R4","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IX.F.R5","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IX.F.S1","description":"Recognize an engine failure promptly"},
    {"code":"PA.IX.F.S2","description":"Set the engine controls, reduce drag, identify and verify the inoperative engine"},
    {"code":"PA.IX.F.S3","description":"Maintain Vyse +/-10 knots, if able to climb"},
    {"code":"PA.IX.F.S4","description":"Maintain directional control at all times"},
    {"code":"PA.IX.F.S5","description":"Establish a bank of approximately 5 degrees toward the operating engine, as required for best performance"},
    {"code":"PA.IX.F.S6","description":"Maintain a safe heading when a climb is not possible"},
    {"code":"PA.IX.F.S7","description":"Monitor the operating engine and make necessary adjustments"},
    {"code":"PA.IX.F.S8","description":"Attempt to determine and resolve the reason for the failure, if altitude allows"},
    {"code":"PA.IX.F.S9","description":"Secure the inoperative engine if restart is not possible"},
    {"code":"PA.IX.F.S10","description":"Complete the appropriate checklist(s)"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.IX.G', 'private', 'Emergency Operations', 'Approach and Landing with an Inoperative Engine (Simulated) (AMEL, AMES)',
  $$[
    {"code":"PA.IX.G.K1","description":"Procedures used during approach and landing with one engine inoperative"},
    {"code":"PA.IX.G.K2","description":"Effects of density altitude on Vmc and single-engine performance"},
    {"code":"PA.IX.G.K3","description":"Vmc (red line), Vyse (blue line), and Vsse (safe single-engine speed)"},
    {"code":"PA.IX.G.K4","description":"Configuration and trim effects on single-engine approach and landing"},
    {"code":"PA.IX.G.K5","description":"Single-engine go-around procedures"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IX.G.R1","description":"Delayed recognition of the need for a go-around from a single-engine approach"},
    {"code":"PA.IX.G.R2","description":"Collision hazards"},
    {"code":"PA.IX.G.R3","description":"Configuring the airplane"},
    {"code":"PA.IX.G.R4","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.IX.G.R5","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.IX.G.R6","description":"Landing with a crosswind with one engine inoperative"}
  ]$$::jsonb,
  $$[
    {"code":"PA.IX.G.S1","description":"Maintain Vyse +/-10 knots during the approach until landing is assured"},
    {"code":"PA.IX.G.S2","description":"Maintain directional control and proper wind-drift correction throughout the approach and landing"},
    {"code":"PA.IX.G.S3","description":"Establish the recommended approach and landing configuration, and adjust as necessary"},
    {"code":"PA.IX.G.S4","description":"Maintain a stabilized approach and recommended approach airspeed with gust factor applied"},
    {"code":"PA.IX.G.S5","description":"Make smooth, timely, and correct control inputs during round out and touchdown"},
    {"code":"PA.IX.G.S6","description":"Touch down at a proper pitch attitude with no side drift"},
    {"code":"PA.IX.G.S7","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.IX.G.S8","description":"Maintain situational awareness throughout the approach and landing"},
    {"code":"PA.IX.G.S9","description":"Demonstrate single-engine go-around procedures"},
    {"code":"PA.IX.G.S10","description":"Use runway incursion avoidance procedures, if applicable"}
  ]$$::jsonb
);

-- ============================================================
-- AREA X: Multiengine Operations (4 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.X.A', 'private', 'Multiengine Operations', 'Maneuvering with One Engine Inoperative (AMEL, AMES)',
  $$[
    {"code":"PA.X.A.K1","description":"Aerodynamics associated with maneuvering with one engine inoperative"},
    {"code":"PA.X.A.K2","description":"Effects of density altitude on Vmc and single-engine performance"},
    {"code":"PA.X.A.K3","description":"Vmc (red line), Vyse (blue line), and Vsse (safe single-engine speed)"},
    {"code":"PA.X.A.K4","description":"Configuration and trim effects on single-engine performance"},
    {"code":"PA.X.A.K5","description":"Engine failure procedures and single-engine operation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.X.A.R1","description":"Factors and situations that could lead to loss of control with one engine inoperative"},
    {"code":"PA.X.A.R2","description":"Collision hazards"},
    {"code":"PA.X.A.R3","description":"Configuring the airplane"},
    {"code":"PA.X.A.R4","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.X.A.R5","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.X.A.S1","description":"Recognize an engine failure promptly"},
    {"code":"PA.X.A.S2","description":"Set the engine controls, reduce drag, identify and verify the inoperative engine"},
    {"code":"PA.X.A.S3","description":"Maintain Vyse +/-10 knots during maneuvering"},
    {"code":"PA.X.A.S4","description":"Maintain directional control at all times"},
    {"code":"PA.X.A.S5","description":"Establish a bank of approximately 5 degrees toward the operating engine, as required for best performance"},
    {"code":"PA.X.A.S6","description":"Monitor the operating engine and make necessary adjustments"},
    {"code":"PA.X.A.S7","description":"Demonstrate maneuvering flight with one engine inoperative to include straight-and-level, turns, and climbs/descents"},
    {"code":"PA.X.A.S8","description":"Complete the appropriate checklist(s)"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.X.B', 'private', 'Multiengine Operations', 'Vmc Demonstration (AMEL, AMES)',
  $$[
    {"code":"PA.X.B.K1","description":"Factors affecting Vmc and how Vmc differs from stall speed (Vs)"},
    {"code":"PA.X.B.K2","description":"Vmc (red line), Vyse (blue line), and safe single-engine speed (Vsse)"},
    {"code":"PA.X.B.K3","description":"Cause of loss of directional control at airspeeds below Vmc"},
    {"code":"PA.X.B.K4","description":"Proper procedures for maneuver entry and safe recovery"}
  ]$$::jsonb,
  $$[
    {"code":"PA.X.B.R1","description":"Configuring the airplane"},
    {"code":"PA.X.B.R2","description":"Maneuvering with one engine inoperative"},
    {"code":"PA.X.B.R3","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"}
  ]$$::jsonb,
  $$[
    {"code":"PA.X.B.S1","description":"Configure the airplane in accordance with the manufacturer recommendation or evaluator instruction"},
    {"code":"PA.X.B.S2","description":"Establish a single-engine climb at Vyse"},
    {"code":"PA.X.B.S3","description":"Slowly reduce airspeed with the operative engine at maximum available power and the simulated inoperative engine windmilling"},
    {"code":"PA.X.B.S4","description":"At the first indication of loss of directional control or onset of stall buffet, or at the published Vmc if it is reached first, recover promptly"},
    {"code":"PA.X.B.S5","description":"Recovery includes reducing power on the operative engine sufficiently to stop the yaw, then regaining wings-level flight"},
    {"code":"PA.X.B.S6","description":"Recover without excessive altitude loss, heading change, or entry into a stall or spin"},
    {"code":"PA.X.B.S7","description":"Maintain altitude above 3,000 feet AGL throughout the maneuver"},
    {"code":"PA.X.B.S8","description":"Complete the appropriate checklist(s)"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.X.C', 'private', 'Multiengine Operations', 'One Engine Inoperative (Simulated) During Straight-and-Level Flight and Turns (AMEL, AMES)',
  $$[
    {"code":"PA.X.C.K1","description":"Procedures used if engine failure occurs during straight-and-level flight and turns while on instruments"}
  ]$$::jsonb,
  $$[
    {"code":"PA.X.C.R1","description":"Factors and situations that could lead to loss of control with one engine inoperative on instruments"},
    {"code":"PA.X.C.R2","description":"Collision hazards"},
    {"code":"PA.X.C.R3","description":"Configuring the airplane"},
    {"code":"PA.X.C.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.X.C.R5","description":"Instrument interpretation with one engine inoperative"}
  ]$$::jsonb,
  $$[
    {"code":"PA.X.C.S1","description":"Recognize an engine failure promptly"},
    {"code":"PA.X.C.S2","description":"Set the engine controls, reduce drag, identify and verify the inoperative engine"},
    {"code":"PA.X.C.S3","description":"Maintain Vyse +/-10 knots"},
    {"code":"PA.X.C.S4","description":"Maintain directional control using proper instrument cross-check and coordinated flight control application"},
    {"code":"PA.X.C.S5","description":"Establish a bank of approximately 5 degrees toward the operating engine"},
    {"code":"PA.X.C.S6","description":"Monitor the operating engine and make necessary adjustments"},
    {"code":"PA.X.C.S7","description":"Maintain altitude +/-100 feet and heading +/-10 degrees during straight-and-level flight"},
    {"code":"PA.X.C.S8","description":"Maintain altitude +/-100 feet and airspeed +/-10 knots during turns"},
    {"code":"PA.X.C.S9","description":"Maintain a standard rate turn or a 30-degree bank, whichever requires a lesser degree of bank"},
    {"code":"PA.X.C.S10","description":"Roll out on the specified heading +/-10 degrees"},
    {"code":"PA.X.C.S11","description":"Complete the appropriate checklist(s)"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.X.D', 'private', 'Multiengine Operations', 'Instrument Approach and Landing with an Inoperative Engine (Simulated) (AMEL, AMES)',
  $$[
    {"code":"PA.X.D.K1","description":"Instrument approach procedures with one engine inoperative"}
  ]$$::jsonb,
  $$[
    {"code":"PA.X.D.R1","description":"Factors and situations that could lead to loss of control during a single-engine instrument approach"},
    {"code":"PA.X.D.R2","description":"Collision hazards"},
    {"code":"PA.X.D.R3","description":"Configuring the airplane"},
    {"code":"PA.X.D.R4","description":"Low altitude maneuvering including stall, spin, or controlled flight into terrain (CFIT)"},
    {"code":"PA.X.D.R5","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.X.D.R6","description":"Single-engine missed approach/go-around procedures"}
  ]$$::jsonb,
  $$[
    {"code":"PA.X.D.S1","description":"Recognize an engine failure promptly"},
    {"code":"PA.X.D.S2","description":"Set the engine controls, reduce drag, identify and verify the inoperative engine"},
    {"code":"PA.X.D.S3","description":"Follow the published instrument approach procedure"},
    {"code":"PA.X.D.S4","description":"Maintain Vyse +/-10 knots until landing is assured"},
    {"code":"PA.X.D.S5","description":"Maintain directional control using proper instrument cross-check and coordinated flight control application"},
    {"code":"PA.X.D.S6","description":"Establish a bank of approximately 5 degrees toward the operating engine"},
    {"code":"PA.X.D.S7","description":"Monitor the operating engine and make necessary adjustments"},
    {"code":"PA.X.D.S8","description":"Establish the recommended approach and landing configuration, and adjust as necessary"},
    {"code":"PA.X.D.S9","description":"Maintain a stabilized approach"},
    {"code":"PA.X.D.S10","description":"Make smooth, timely, and correct control inputs during round out and touchdown"},
    {"code":"PA.X.D.S11","description":"Touch down at a proper pitch attitude with no side drift"},
    {"code":"PA.X.D.S12","description":"Demonstrate single-engine missed approach/go-around procedures"},
    {"code":"PA.X.D.S13","description":"Complete the appropriate checklist(s)"}
  ]$$::jsonb
);

-- ============================================================
-- AREA XI: Night Operations (1 task)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.XI.A', 'private', 'Night Operations', 'Night Operations',
  $$[
    {"code":"PA.XI.A.K1","description":"Physiological aspects of vision related to night flying"},
    {"code":"PA.XI.A.K2","description":"Lighting systems identifying airports, runways, taxiways, and obstructions, as well as pilot-controlled lighting"},
    {"code":"PA.XI.A.K3","description":"Airplane equipment and lighting requirements for night operations"},
    {"code":"PA.XI.A.K4","description":"Personal equipment essential for night flight"},
    {"code":"PA.XI.A.K5","description":"Night orientation, navigation, chart reading techniques, and methods for maintaining night vision effectiveness"},
    {"code":"PA.XI.A.K6","description":"Night taxi operations"},
    {"code":"PA.XI.A.K7","description":"Interpretation of traffic position and direction based solely on position lights"},
    {"code":"PA.XI.A.K8","description":"Visual illusions at night"}
  ]$$::jsonb,
  $$[
    {"code":"PA.XI.A.R1","description":"Collision hazards"},
    {"code":"PA.XI.A.R2","description":"Distractions, task prioritization, loss of situational awareness, or disorientation"},
    {"code":"PA.XI.A.R3","description":"Effect of visual illusions and night adaptation during all phases of night flying"},
    {"code":"PA.XI.A.R4","description":"Runway incursion"},
    {"code":"PA.XI.A.R5","description":"Night currency versus proficiency"},
    {"code":"PA.XI.A.R6","description":"Weather considerations specific to night operations"},
    {"code":"PA.XI.A.R7","description":"Inoperative equipment"}
  ]$$::jsonb,
  '[]'::jsonb
);

-- ============================================================
-- AREA XII: Postflight Procedures (2 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.XII.A', 'private', 'Postflight Procedures', 'After Landing, Parking, and Securing (ASEL, AMEL)',
  $$[
    {"code":"PA.XII.A.K1","description":"Airplane shutdown, securing, and postflight inspection"},
    {"code":"PA.XII.A.K2","description":"Documenting in-flight/postflight discrepancies"}
  ]$$::jsonb,
  $$[
    {"code":"PA.XII.A.R1","description":"Activities and distractions"},
    {"code":"PA.XII.A.R3","description":"Airport-specific security procedures"},
    {"code":"PA.XII.A.R4","description":"Disembarking passengers safely on the ramp and monitoring passenger movement while on the ramp"}
  ]$$::jsonb,
  $$[
    {"code":"PA.XII.A.S2","description":"Park in an appropriate area, considering the safety of nearby persons and property"},
    {"code":"PA.XII.A.S3","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.XII.A.S4","description":"Conduct a postflight inspection and document discrepancies and servicing requirements, if any"},
    {"code":"PA.XII.A.S5","description":"Secure the airplane"}
  ]$$::jsonb
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements) VALUES
(
  'PA.XII.B', 'private', 'Postflight Procedures', 'Seaplane Post-Landing Procedures (ASES, AMES)',
  $$[
    {"code":"PA.XII.B.K1","description":"Mooring"},
    {"code":"PA.XII.B.K2","description":"Docking"},
    {"code":"PA.XII.B.K3","description":"Anchoring"},
    {"code":"PA.XII.B.K4","description":"Beaching/ramping"},
    {"code":"PA.XII.B.K5","description":"Postflight inspection, recording of in-flight/postflight discrepancies"}
  ]$$::jsonb,
  $$[
    {"code":"PA.XII.B.R1","description":"Activities and distractions"},
    {"code":"PA.XII.B.R3","description":"Seaplane base specific security procedures, if applicable"},
    {"code":"PA.XII.B.R4","description":"Disembarking passengers safely on the ramp and monitoring passenger movement while on the ramp"}
  ]$$::jsonb,
  $$[
    {"code":"PA.XII.B.S1","description":"Secure the airplane appropriately considering mooring, docking, anchoring, or beaching/ramping"},
    {"code":"PA.XII.B.S2","description":"Conduct a postflight inspection and document discrepancies and servicing requirements, if any"},
    {"code":"PA.XII.B.S3","description":"Complete the appropriate checklist(s)"},
    {"code":"PA.XII.B.S4","description":"Disembark passengers safely"},
    {"code":"PA.XII.B.S5","description":"Secure the airplane for the anticipated conditions and environment"}
  ]$$::jsonb
);

COMMIT;