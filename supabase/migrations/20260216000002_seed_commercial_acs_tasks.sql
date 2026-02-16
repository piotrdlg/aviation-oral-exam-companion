-- Seed all Commercial Pilot ACS tasks (FAA-S-ACS-7B, November 2023)
-- Each element is a top-level K/R/S item; sub-elements are folded into parent descriptions.
-- Task ID prefix: CA. (Commercial Airplane)
-- Rating: 'commercial'

BEGIN;

-- ============================================================
-- AREA I: Preflight Preparation (9 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.I.A', 'commercial', 'Preflight Preparation', 'Pilot Qualifications',
  $$[
    {"code":"CA.I.A.K1","description":"Certification requirements, recent flight experience, and recordkeeping."},
    {"code":"CA.I.A.K2","description":"Privileges and limitations."},
    {"code":"CA.I.A.K3","description":"Medical certificates: class, expiration, privileges, temporary disqualifications."},
    {"code":"CA.I.A.K4","description":"Documents required to exercise commercial pilot privileges."},
    {"code":"CA.I.A.K5","description":"Part 68 BasicMed privileges and limitations."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.A.R1","description":"Proficiency versus currency."},
    {"code":"CA.I.A.R2","description":"Flying unfamiliar aircraft or operating with unfamiliar flight display systems and avionics."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.A.S1","description":"Apply requirements to act as pilot-in-command (PIC) under Visual Flight Rules (VFR) in a scenario given by the evaluator."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.I.B', 'commercial', 'Preflight Preparation', 'Airworthiness Requirements',
  $$[
    {"code":"CA.I.B.K1","description":"General airworthiness requirements and compliance for airplanes, including: location and expiration dates of required aircraft certificates, required inspections and airplane logbook documentation, Airworthiness Directives and Special Airworthiness Information Bulletins, purpose and procedure for obtaining a special flight permit."},
    {"code":"CA.I.B.K2","description":"Pilot-performed preventive maintenance."},
    {"code":"CA.I.B.K3","description":"Equipment requirements for day and night VFR flight, including: flying with inoperative equipment, using an approved Minimum Equipment List (MEL), Kinds of Operation Equipment List (KOEL), required discrepancy records or placards."},
    {"code":"CA.I.B.K4","description":"Special airworthiness certificate aircraft operating limitations, if applicable."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.B.R1","description":"Inoperative equipment discovered prior to flight."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.B.S1","description":"Locate and describe airplane airworthiness and registration information."},
    {"code":"CA.I.B.S2","description":"Determine the airplane is airworthy in the scenario given by the evaluator."},
    {"code":"CA.I.B.S3","description":"Apply appropriate procedures for operating with inoperative equipment in the scenario given by the evaluator."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.I.C', 'commercial', 'Preflight Preparation', 'Weather Information',
  $$[
    {"code":"CA.I.C.K1","description":"Sources of weather data (e.g., National Weather Service, Flight Service) for flight planning purposes."},
    {"code":"CA.I.C.K2","description":"Acceptable weather products and resources required for preflight planning, current and forecast weather for departure, en route, and arrival phases of flight such as: Airport Observations (METAR and SPECI) and Pilot Observations (PIREP), Surface Analysis Chart, Ceiling and Visibility Chart (CVA), Terminal Aerodrome Forecasts (TAF), Graphical Forecasts for Aviation (GFA), Wind and Temperature Aloft Forecast (FB), Convective Outlook (AC), Inflight Aviation Weather Advisories including Airmen''s Meteorological Information (AIRMET), Significant Meteorological Information (SIGMET), and Convective SIGMET."},
    {"code":"CA.I.C.K3","description":"Meteorology applicable to the departure, en route, alternate, and destination under visual flight rules (VFR) in Visual Meteorological Conditions (VMC), including expected climate and hazardous conditions such as: atmospheric composition and stability, wind (e.g., windshear, mountain wave, factors affecting wind, etc.), temperature and heat exchange, moisture/precipitation, weather system formation, including air masses and fronts, clouds, turbulence, thunderstorms and microbursts, icing and freezing level information, fog/mist, frost, obstructions to visibility (e.g., smoke, haze, volcanic ash, etc.)."},
    {"code":"CA.I.C.K4","description":"Flight deck instrument displays of digital weather and aeronautical information."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.C.R1","description":"Making the go/no-go and continue/divert decisions, including: circumstances that would make diversion prudent, personal weather minimums, hazardous weather conditions, including known or forecast icing or turbulence aloft."},
    {"code":"CA.I.C.R2","description":"Use and limitations of: installed onboard weather equipment, aviation weather reports and forecasts, inflight weather resources."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.C.S1","description":"Use available aviation weather resources to obtain an adequate weather briefing."},
    {"code":"CA.I.C.S2","description":"Analyze the implications of at least three of the conditions listed in K3a through K3l, using actual weather or weather conditions provided by the evaluator."},
    {"code":"CA.I.C.S3","description":"Correlate weather information to make a go/no-go decision."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.I.D', 'commercial', 'Preflight Preparation', 'Cross-Country Flight Planning',
  $$[
    {"code":"CA.I.D.K1","description":"Route planning, including consideration of different classes and special use airspace (SUA) and selection of appropriate and available navigation/communication systems and facilities, including use of an electronic flight bag (EFB), if used."},
    {"code":"CA.I.D.K2","description":"Altitude selection accounting for terrain and obstacles, glide distance of airplane, VFR cruising altitudes, and effect of wind."},
    {"code":"CA.I.D.K3","description":"Calculating: time, climb and descent rates, course, distance, heading, true airspeed, and groundspeed; estimated time of arrival, including conversion to universal coordinated time (UTC); fuel requirements, including reserve."},
    {"code":"CA.I.D.K4","description":"Elements of a VFR flight plan."},
    {"code":"CA.I.D.K5","description":"Procedures for filing, activating, and closing a VFR flight plan."},
    {"code":"CA.I.D.K6","description":"Inflight intercept procedures."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.D.R1","description":"Pilot."},
    {"code":"CA.I.D.R2","description":"Aircraft."},
    {"code":"CA.I.D.R3","description":"Environment (e.g., weather, airports, airspace, terrain, obstacles)."},
    {"code":"CA.I.D.R4","description":"External pressures."},
    {"code":"CA.I.D.R5","description":"Limitations of air traffic control (ATC) services."},
    {"code":"CA.I.D.R6","description":"Fuel planning."},
    {"code":"CA.I.D.R7","description":"Use of an electronic flight bag (EFB), if used."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.D.S1","description":"Prepare, present, and explain a cross-country flight plan assigned by the evaluator, including a risk analysis based on real-time weather, to the first fuel stop."},
    {"code":"CA.I.D.S2","description":"Apply pertinent information from appropriate and current aeronautical charts, Chart Supplements; Notices to Air Missions (NOTAMs) relative to airport, runway and taxiway closures; and other flight publications."},
    {"code":"CA.I.D.S3","description":"Create a navigation log and prepare a VFR flight plan."},
    {"code":"CA.I.D.S4","description":"Recalculate fuel reserves based on a scenario provided by the evaluator."},
    {"code":"CA.I.D.S5","description":"Use an electronic flight bag (EFB), if applicable."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.I.E', 'commercial', 'Preflight Preparation', 'National Airspace System',
  $$[
    {"code":"CA.I.E.K1","description":"Airspace classes and associated requirements and limitations."},
    {"code":"CA.I.E.K2","description":"Chart symbols."},
    {"code":"CA.I.E.K3","description":"Special use airspace (SUA), special flight rules areas (SFRA), temporary flight restrictions (TFR), and other airspace areas."},
    {"code":"CA.I.E.K4","description":"Special visual flight rules (VFR) requirements."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.E.R1","description":"Various classes and types of airspace."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.E.S1","description":"Identify and comply with the requirements for basic VFR weather minimums and flying in particular classes of airspace."},
    {"code":"CA.I.E.S2","description":"Correctly identify airspace and operate in accordance with associated communication and equipment requirements."},
    {"code":"CA.I.E.S3","description":"Identify the requirements for operating in SUA or within a TFR. Identify and comply with special air traffic rules (SATR) and SFRA operations, if applicable."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.I.F', 'commercial', 'Preflight Preparation', 'Performance and Limitations',
  $$[
    {"code":"CA.I.F.K1","description":"Elements related to performance and limitations by explaining the use of charts, tables, and data to determine performance."},
    {"code":"CA.I.F.K2","description":"Factors affecting performance, including: atmospheric conditions, pilot technique, airplane configuration, airport environment, loading and weight and balance."},
    {"code":"CA.I.F.K3","description":"Aerodynamics."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.F.R1","description":"Use of performance charts, tables, and data."},
    {"code":"CA.I.F.R2","description":"Airplane limitations."},
    {"code":"CA.I.F.R3","description":"Possible differences between calculated performance and actual performance."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.F.S1","description":"Compute the weight and balance, correct out-of-CG loading errors and determine if the weight and balance remains within limits during all phases of flight."},
    {"code":"CA.I.F.S2","description":"Use the appropriate airplane performance charts, tables, and data."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.I.G', 'commercial', 'Preflight Preparation', 'Operation of Systems',
  $$[
    {"code":"CA.I.G.K1","description":"Airplane systems, including: primary flight controls, secondary flight controls, powerplant and propeller, landing gear, fuel, oil, and hydraulic, electrical, avionics, pitot-static, vacuum/pressure, and associated flight instruments, environmental, deicing and anti-icing, water rudders (ASES, AMES), oxygen system."},
    {"code":"CA.I.G.K2","description":"Indications of and procedures for managing system abnormalities or failures."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.G.R1","description":"Detection of system malfunctions or failures."},
    {"code":"CA.I.G.R2","description":"Management of a system failure."},
    {"code":"CA.I.G.R3","description":"Monitoring and management of automated systems."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.G.S1","description":"Operate at least three of the systems listed in K1a through K1l appropriately."},
    {"code":"CA.I.G.S2","description":"Complete the appropriate checklist(s)."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.I.H', 'commercial', 'Preflight Preparation', 'Human Factors',
  $$[
    {"code":"CA.I.H.K1","description":"Symptoms, recognition, causes, effects, and corrective actions associated with aeromedical and physiological issues, including: hypoxia, hyperventilation, middle ear and sinus problems, spatial disorientation, motion sickness, carbon monoxide poisoning, stress, fatigue, dehydration and nutrition, hypothermia, optical illusions, dissolved nitrogen in the bloodstream after scuba dives."},
    {"code":"CA.I.H.K2","description":"Regulations regarding use of alcohol and drugs."},
    {"code":"CA.I.H.K3","description":"Effects of alcohol, drugs, and over-the-counter medications."},
    {"code":"CA.I.H.K4","description":"Aeronautical Decision-Making (ADM) to include using Crew Resource Management (CRM) or Single-Pilot Resource Management (SRM), as appropriate."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.H.R1","description":"Aeromedical and physiological issues."},
    {"code":"CA.I.H.R2","description":"Hazardous attitudes."},
    {"code":"CA.I.H.R3","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.I.H.R4","description":"Confirmation and expectation bias."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.H.S1","description":"Associate the symptoms and effects for at least three of the conditions listed in K1a through K1l with the cause(s) and corrective action(s)."},
    {"code":"CA.I.H.S2","description":"Perform self-assessment, including fitness for flight and personal minimums, for actual flight or a scenario given by the evaluator."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.I.I', 'commercial', 'Preflight Preparation', 'Water and Seaplane Characteristics, Seaplane Bases, Maritime Rules, and Aids to Marine Navigation',
  $$[
    {"code":"CA.I.I.K1","description":"The characteristics of a water surface as affected by features, such as: size and location, protected and unprotected areas, surface wind, direction and strength of water current, floating and partially submerged debris, sandbars, islands, and shoals, vessel traffic and wakes, other characteristics specific to the area, direction and height of waves."},
    {"code":"CA.I.I.K2","description":"Float and hull construction, and its effect on seaplane performance."},
    {"code":"CA.I.I.K3","description":"Causes of porpoising and skipping, and the pilot action needed to prevent or correct these occurrences."},
    {"code":"CA.I.I.K4","description":"How to locate and identify seaplane bases on charts or in directories."},
    {"code":"CA.I.I.K5","description":"Operating restrictions at various bases."},
    {"code":"CA.I.I.K6","description":"Right-of-way, steering, and sailing rules pertinent to seaplane operation."},
    {"code":"CA.I.I.K7","description":"Marine navigation aids, such as buoys, beacons, lights, sound signals, and range markers."},
    {"code":"CA.I.I.K8","description":"Naval vessel protection zones."},
    {"code":"CA.I.I.K9","description":"No wake zones."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.I.R1","description":"Local conditions."},
    {"code":"CA.I.I.R2","description":"Impact of marine traffic."},
    {"code":"CA.I.I.R3","description":"Right-of-way and sailing rules pertinent to seaplane operations."},
    {"code":"CA.I.I.R4","description":"Limited services and assistance available at seaplane bases."}
  ]$$::jsonb,
  $$[
    {"code":"CA.I.I.S1","description":"Assess the water surface characteristics for the proposed flight."},
    {"code":"CA.I.I.S2","description":"Identify restrictions at local seaplane bases."},
    {"code":"CA.I.I.S3","description":"Identify marine navigation aids."},
    {"code":"CA.I.I.S4","description":"Describe correct right-of-way, steering, and sailing operations."},
    {"code":"CA.I.I.S5","description":"Explain how float and hull construction can affect seaplane performance."},
    {"code":"CA.I.I.S6","description":"Describe how to correct for porpoising and skipping."}
  ]$$::jsonb,
  '{ASES,AMES}'
);

-- ============================================================
-- AREA II: Preflight Procedures (6 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.II.A', 'commercial', 'Preflight Procedures', 'Preflight Assessment',
  $$[
    {"code":"CA.II.A.K1","description":"Pilot self-assessment."},
    {"code":"CA.II.A.K2","description":"Determining that the airplane to be used is appropriate and airworthy."},
    {"code":"CA.II.A.K3","description":"Airplane preflight inspection, including: which items should be inspected, the reasons for checking each item, how to detect possible defects, the associated regulations."},
    {"code":"CA.II.A.K4","description":"Environmental factors, including weather, terrain, route selection, and obstructions."}
  ]$$::jsonb,
  $$[
    {"code":"CA.II.A.R1","description":"Pilot."},
    {"code":"CA.II.A.R2","description":"Aircraft."},
    {"code":"CA.II.A.R3","description":"Environment (e.g., weather, airports, airspace, terrain, obstacles)."},
    {"code":"CA.II.A.R4","description":"External pressures."},
    {"code":"CA.II.A.R5","description":"Aviation security concerns."}
  ]$$::jsonb,
  $$[
    {"code":"CA.II.A.S1","description":"Inspect the airplane with reference to an appropriate checklist."},
    {"code":"CA.II.A.S2","description":"Verify the airplane is in condition for safe flight and conforms to its type design."},
    {"code":"CA.II.A.S3","description":"Perform self-assessment."},
    {"code":"CA.II.A.S4","description":"Continue to assess the environment for safe flight."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.II.B', 'commercial', 'Preflight Procedures', 'Flight Deck Management',
  $$[
    {"code":"CA.II.B.K1","description":"Passenger briefing requirements, including operation and required use of safety restraint systems."},
    {"code":"CA.II.B.K2","description":"Use of appropriate checklists."},
    {"code":"CA.II.B.K3","description":"Requirements for current and appropriate navigation data."},
    {"code":"CA.II.B.K4","description":"Securing items and cargo."}
  ]$$::jsonb,
  $$[
    {"code":"CA.II.B.R1","description":"Use of systems or equipment, including automation and portable electronic devices."},
    {"code":"CA.II.B.R2","description":"Inoperative equipment."},
    {"code":"CA.II.B.R3","description":"Passenger distractions."}
  ]$$::jsonb,
  $$[
    {"code":"CA.II.B.S1","description":"Secure all items in the aircraft."},
    {"code":"CA.II.B.S2","description":"Conduct an appropriate passenger briefing, including identifying the pilot-in-command (PIC), use of safety belts, shoulder harnesses, doors, passenger conduct, sterile aircraft, propeller blade avoidance, and emergency procedures."},
    {"code":"CA.II.B.S3","description":"Properly program and manage the aircraft''s automation, as applicable."},
    {"code":"CA.II.B.S4","description":"Appropriately manage risks by utilizing ADM, including SRM/CRM."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.II.C', 'commercial', 'Preflight Procedures', 'Engine Starting',
  $$[
    {"code":"CA.II.C.K1","description":"Starting under various conditions."},
    {"code":"CA.II.C.K2","description":"Starting the engine(s) by use of external power."},
    {"code":"CA.II.C.K3","description":"Engine limitations as they relate to starting."}
  ]$$::jsonb,
  $$[
    {"code":"CA.II.C.R1","description":"Propeller safety."}
  ]$$::jsonb,
  $$[
    {"code":"CA.II.C.S1","description":"Position the airplane properly considering structures, other aircraft, wind, and the safety of nearby persons and property."},
    {"code":"CA.II.C.S2","description":"Complete the appropriate checklist(s)."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.II.D', 'commercial', 'Preflight Procedures', 'Taxiing',
  $$[
    {"code":"CA.II.D.K1","description":"Current airport aeronautical references and information resources such as the Chart Supplement, airport diagram, and Notices to Air Missions (NOTAMs)."},
    {"code":"CA.II.D.K2","description":"Taxi instructions/clearances."},
    {"code":"CA.II.D.K3","description":"Airport markings, signs, and lights."},
    {"code":"CA.II.D.K4","description":"Visual indicators for wind."},
    {"code":"CA.II.D.K5","description":"Aircraft lighting, as appropriate."},
    {"code":"CA.II.D.K6","description":"Procedures for: appropriate flight deck activities prior to taxi, including route planning and identifying the location of Hot Spots; radio communications at towered and nontowered airports; entering or crossing runways; night taxi operations; low visibility taxi operations."}
  ]$$::jsonb,
  $$[
    {"code":"CA.II.D.R1","description":"Activities and distractions."},
    {"code":"CA.II.D.R2","description":"Confirmation or expectation bias as related to taxi instructions."},
    {"code":"CA.II.D.R3","description":"A taxi route or departure runway change."},
    {"code":"CA.II.D.R4","description":"Runway incursion."}
  ]$$::jsonb,
  $$[
    {"code":"CA.II.D.S1","description":"Receive and correctly read back clearances/instructions, if applicable."},
    {"code":"CA.II.D.S2","description":"Use an airport diagram or taxi chart during taxi, if published, and maintain situational awareness."},
    {"code":"CA.II.D.S3","description":"Position the flight controls for the existing wind, if applicable."},
    {"code":"CA.II.D.S4","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.II.D.S5","description":"Perform a brake check immediately after the airplane begins moving."},
    {"code":"CA.II.D.S6","description":"Maintain positive control of the airplane during ground operations by controlling direction and speed without excessive use of brakes."},
    {"code":"CA.II.D.S7","description":"Comply with airport/taxiway markings, signals, and air traffic control (ATC) clearances and instructions."},
    {"code":"CA.II.D.S8","description":"Position the airplane properly relative to hold lines."}
  ]$$::jsonb,
  '{ASEL,AMEL}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.II.E', 'commercial', 'Preflight Procedures', 'Taxiing and Sailing',
  $$[
    {"code":"CA.II.E.K1","description":"Airport information resources, including Chart Supplements, airport diagram, and appropriate references."},
    {"code":"CA.II.E.K2","description":"Taxi instructions/clearances."},
    {"code":"CA.II.E.K3","description":"Airport/seaplane base markings, signs, and lights."},
    {"code":"CA.II.E.K4","description":"Visual indicators for wind."},
    {"code":"CA.II.E.K5","description":"Airplane lighting."},
    {"code":"CA.II.E.K6","description":"Procedures for: appropriate flight deck activities during taxiing or sailing, radio communications at towered and nontowered seaplane bases."}
  ]$$::jsonb,
  $$[
    {"code":"CA.II.E.R1","description":"Activities and distractions."},
    {"code":"CA.II.E.R2","description":"Porpoising and skipping."},
    {"code":"CA.II.E.R3","description":"Low visibility taxi and sailing operations."},
    {"code":"CA.II.E.R4","description":"Other aircraft, vessels, and hazards."},
    {"code":"CA.II.E.R5","description":"Confirmation or expectation bias as related to taxi instructions."}
  ]$$::jsonb,
  $$[
    {"code":"CA.II.E.S1","description":"Receive and correctly read back clearances/instructions, if applicable."},
    {"code":"CA.II.E.S2","description":"Use an appropriate airport diagram or taxi chart, if published."},
    {"code":"CA.II.E.S3","description":"Comply with seaplane base/airport/taxiway markings, signals, and signs."},
    {"code":"CA.II.E.S4","description":"Depart the dock/mooring buoy or beach/ramp in a safe manner, considering wind, current, traffic, and hazards."},
    {"code":"CA.II.E.S5","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.II.E.S6","description":"Position the flight controls, flaps, doors, water rudders, and power correctly for the existing conditions to follow the desired course while sailing and to prevent or correct for porpoising and skipping during step taxi."},
    {"code":"CA.II.E.S7","description":"Exhibit procedures for steering and maneuvering while maintaining proper situational awareness and desired orientation, path, and position while taxiing using idle, plow, or step taxi technique, as appropriate."},
    {"code":"CA.II.E.S8","description":"Plan and follow the most favorable taxi or sailing course for current conditions."},
    {"code":"CA.II.E.S9","description":"Abide by right-of-way rules, maintain positive airplane control, proper speed, and separation between other aircraft, vessels, and persons."},
    {"code":"CA.II.E.S10","description":"Comply with applicable taxi elements in Task D if the practical test is conducted in an amphibious airplane."}
  ]$$::jsonb,
  '{ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.II.F', 'commercial', 'Preflight Procedures', 'Before Takeoff Check',
  $$[
    {"code":"CA.II.F.K1","description":"Purpose of before takeoff checklist items, including: reasons for checking each item, detecting malfunctions, ensuring the aircraft is in safe operating condition as recommended by the manufacturer."}
  ]$$::jsonb,
  $$[
    {"code":"CA.II.F.R1","description":"Division of attention while conducting before takeoff checks."},
    {"code":"CA.II.F.R2","description":"Unexpected runway changes by air traffic control (ATC)."},
    {"code":"CA.II.F.R3","description":"Wake turbulence."},
    {"code":"CA.II.F.R4","description":"Potential powerplant failure during takeoff or other malfunction considering operational factors such as airplane characteristics, runway/takeoff path length, surface conditions, environmental conditions, and obstructions."}
  ]$$::jsonb,
  $$[
    {"code":"CA.II.F.S1","description":"Review takeoff performance."},
    {"code":"CA.II.F.S2","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.II.F.S3","description":"Position the airplane appropriately considering wind direction and the presence of any aircraft, vessels, or buildings as applicable."},
    {"code":"CA.II.F.S4","description":"Divide attention inside and outside the flight deck."},
    {"code":"CA.II.F.S5","description":"Verify that engine parameters and airplane configuration are suitable."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ============================================================
-- AREA III: Airport and Seaplane Base Operations (2 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.III.A', 'commercial', 'Airport and Seaplane Base Operations', 'Communications, Light Signals, and Runway Lighting Systems',
  $$[
    {"code":"CA.III.A.K1","description":"How to obtain appropriate radio frequencies."},
    {"code":"CA.III.A.K2","description":"Proper radio communication procedures and air traffic control (ATC) phraseology."},
    {"code":"CA.III.A.K3","description":"ATC light signal recognition."},
    {"code":"CA.III.A.K4","description":"Appropriate use of transponder(s)."},
    {"code":"CA.III.A.K5","description":"Lost communication procedures."},
    {"code":"CA.III.A.K6","description":"Equipment issues that could cause loss of communication."},
    {"code":"CA.III.A.K7","description":"Radar assistance."},
    {"code":"CA.III.A.K8","description":"National Transportation Safety Board (NTSB) accident/incident reporting."},
    {"code":"CA.III.A.K9","description":"Runway Status Lighting Systems."}
  ]$$::jsonb,
  $$[
    {"code":"CA.III.A.R1","description":"Communication."},
    {"code":"CA.III.A.R2","description":"Deciding if and when to declare an emergency."},
    {"code":"CA.III.A.R3","description":"Use of non-standard phraseology."}
  ]$$::jsonb,
  $$[
    {"code":"CA.III.A.S1","description":"Select and activate appropriate frequencies."},
    {"code":"CA.III.A.S2","description":"Transmit using standard phraseology and procedures as specified in the Aeronautical Information Manual (AIM) and Pilot/Controller Glossary."},
    {"code":"CA.III.A.S3","description":"Acknowledge radio communications and comply with ATC instructions or as directed by the evaluator."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.III.B', 'commercial', 'Airport and Seaplane Base Operations', 'Traffic Patterns',
  $$[
    {"code":"CA.III.B.K1","description":"Towered and nontowered airport operations."},
    {"code":"CA.III.B.K2","description":"Traffic pattern selection for the current conditions."},
    {"code":"CA.III.B.K3","description":"Right-of-way rules."},
    {"code":"CA.III.B.K4","description":"Use of automated weather and airport information."}
  ]$$::jsonb,
  $$[
    {"code":"CA.III.B.R1","description":"Collision hazards."},
    {"code":"CA.III.B.R2","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.III.B.R3","description":"Windshear and wake turbulence."}
  ]$$::jsonb,
  $$[
    {"code":"CA.III.B.S1","description":"Identify and interpret airport/seaplane base runways, taxiways, markings, signs, and lighting."},
    {"code":"CA.III.B.S2","description":"Comply with recommended traffic pattern procedures."},
    {"code":"CA.III.B.S3","description":"Correct for wind drift to maintain the proper ground track."},
    {"code":"CA.III.B.S4","description":"Maintain orientation with the runway/landing area in use."},
    {"code":"CA.III.B.S5","description":"Maintain traffic pattern altitude, +/-100 feet, and the appropriate airspeed, +/-10 knots."},
    {"code":"CA.III.B.S6","description":"Maintain situational awareness and proper spacing from other aircraft in the traffic pattern."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ============================================================
-- AREA IV: Takeoffs, Landings, and Go-Arounds (14 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IV.A', 'commercial', 'Takeoffs, Landings, and Go-Arounds', 'Normal Takeoff and Climb',
  $$[
    {"code":"CA.IV.A.K1","description":"Effects of atmospheric conditions, including wind, on takeoff and climb performance."},
    {"code":"CA.IV.A.K2","description":"Best angle of climb speed (Vx) and best rate of climb speed (Vy)."},
    {"code":"CA.IV.A.K3","description":"Appropriate airplane configuration."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.A.R1","description":"Selection of runway or takeoff path based on aircraft performance and limitations, available distance, and wind."},
    {"code":"CA.IV.A.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, takeoff surface/condition."},
    {"code":"CA.IV.A.R3","description":"Abnormal operations, including planning for: rejected takeoff, potential engine failure in takeoff/climb phase of flight."},
    {"code":"CA.IV.A.R4","description":"Collision hazards."},
    {"code":"CA.IV.A.R5","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IV.A.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.IV.A.R7","description":"Runway incursion."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.A.S1","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IV.A.S2","description":"Make radio calls as appropriate."},
    {"code":"CA.IV.A.S3","description":"Verify assigned/correct runway or takeoff path."},
    {"code":"CA.IV.A.S4","description":"Determine wind direction with or without visible wind direction indicators."},
    {"code":"CA.IV.A.S5","description":"Position the flight controls for the existing wind, if applicable."},
    {"code":"CA.IV.A.S6","description":"Clear the area, taxi into takeoff position, and align the airplane on the runway centerline (ASEL, AMEL) or takeoff path (ASES, AMES), including retracting the water rudders, as appropriate (ASES, AMES)."},
    {"code":"CA.IV.A.S7","description":"Advance the throttle smoothly to takeoff power and confirm proper engine and flight instrument indications prior to rotation, including establishing and maintaining the most efficient planing/lift-off attitude, and correcting for porpoising or skipping (ASES, AMES)."},
    {"code":"CA.IV.A.S8","description":"Avoid excessive water spray on the propeller(s) (ASES, AMES)."},
    {"code":"CA.IV.A.S9","description":"Rotate and lift off at the recommended airspeed and accelerate to Vy."},
    {"code":"CA.IV.A.S11","description":"Establish a pitch attitude to maintain the manufacturer''s recommended speed or Vy, +/-5 knots."},
    {"code":"CA.IV.A.S12","description":"Configure the airplane in accordance with manufacturer''s guidance."},
    {"code":"CA.IV.A.S13","description":"Maintain Vy +/-5 knots to a safe maneuvering altitude."},
    {"code":"CA.IV.A.S14","description":"Maintain directional control and proper wind-drift correction throughout takeoff and climb."},
    {"code":"CA.IV.A.S15","description":"Comply with noise abatement procedures, as applicable."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IV.B', 'commercial', 'Takeoffs, Landings, and Go-Arounds', 'Normal Approach and Landing',
  $$[
    {"code":"CA.IV.B.K1","description":"A stabilized approach, including energy management concepts."},
    {"code":"CA.IV.B.K2","description":"Effects of atmospheric conditions, including wind, on approach and landing performance."},
    {"code":"CA.IV.B.K3","description":"Wind correction techniques on approach and landing."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.B.R1","description":"Selection of runway/landing surface, approach path, and touchdown area based on pilot capability, aircraft performance and limitations, available distance, and wind."},
    {"code":"CA.IV.B.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, landing surface/condition."},
    {"code":"CA.IV.B.R3","description":"Planning for: rejected landing and go-around, land and hold short operations (LAHSO)."},
    {"code":"CA.IV.B.R4","description":"Collision hazards."},
    {"code":"CA.IV.B.R5","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IV.B.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.B.S1","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IV.B.S2","description":"Make radio calls as appropriate."},
    {"code":"CA.IV.B.S3","description":"Ensure the airplane is aligned with the correct/assigned runway or landing surface."},
    {"code":"CA.IV.B.S4","description":"Scan the runway or landing surface and adjoining area for traffic and obstructions."},
    {"code":"CA.IV.B.S5","description":"Select and aim for a suitable touchdown point considering the wind conditions, landing surface, and obstructions."},
    {"code":"CA.IV.B.S6","description":"Establish the recommended approach and landing configuration, airspeed, and trim, and adjust pitch attitude and power as required to maintain a stabilized approach."},
    {"code":"CA.IV.B.S7","description":"Maintain manufacturer''s published approach airspeed or in its absence not more than 1.3 times the stalling speed or the minimum steady flight speed in the landing configuration (Vso), +/-5 knots with gust factor applied."},
    {"code":"CA.IV.B.S8","description":"Maintain directional control and appropriate crosswind correction throughout the approach and landing."},
    {"code":"CA.IV.B.S9","description":"Make smooth, timely, and correct control application during round out and touchdown."},
    {"code":"CA.IV.B.S10","description":"Touch down at a proper pitch attitude, within 200 feet beyond or on the specified point, with no side drift, and with the airplane''s longitudinal axis aligned with and over the runway center/landing path."},
    {"code":"CA.IV.B.S11","description":"Execute a timely go-around if the approach cannot be made within the tolerances specified above or for any other condition that may result in an unsafe approach or landing."},
    {"code":"CA.IV.B.S12","description":"Use runway incursion avoidance procedures, if applicable."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IV.C', 'commercial', 'Takeoffs, Landings, and Go-Arounds', 'Soft-Field Takeoff and Climb',
  $$[
    {"code":"CA.IV.C.K1","description":"Effects of atmospheric conditions, including wind, on takeoff and climb performance."},
    {"code":"CA.IV.C.K2","description":"Best angle of climb speed (Vx) and best rate of climb speed (Vy)."},
    {"code":"CA.IV.C.K3","description":"Appropriate airplane configuration."},
    {"code":"CA.IV.C.K4","description":"Ground effect."},
    {"code":"CA.IV.C.K5","description":"Importance of weight transfer from wheels to wings."},
    {"code":"CA.IV.C.K6","description":"Left turning tendencies."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.C.R1","description":"Selection of runway based on pilot capability, airplane performance and limitations, available distance, and wind."},
    {"code":"CA.IV.C.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, takeoff surface/condition."},
    {"code":"CA.IV.C.R3","description":"Abnormal operations, including planning for: rejected takeoff, potential engine failure in takeoff/climb phase of flight."},
    {"code":"CA.IV.C.R4","description":"Collision hazards."},
    {"code":"CA.IV.C.R5","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IV.C.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.C.S1","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IV.C.S2","description":"Make radio calls as appropriate."},
    {"code":"CA.IV.C.S3","description":"Verify assigned/correct runway."},
    {"code":"CA.IV.C.S4","description":"Determine wind direction with or without visible wind direction indicators."},
    {"code":"CA.IV.C.S5","description":"Position the flight controls for the existing wind, if applicable."},
    {"code":"CA.IV.C.S6","description":"Clear the area, maintain necessary flight control inputs, taxi into takeoff position and align the airplane on the runway centerline without stopping, while advancing the throttle smoothly to takeoff power."},
    {"code":"CA.IV.C.S7","description":"Confirm takeoff power and proper engine and flight instrument indications."},
    {"code":"CA.IV.C.S8","description":"Establish and maintain a pitch attitude that transfers the weight of the airplane from the wheels to the wings as rapidly as possible."},
    {"code":"CA.IV.C.S9","description":"Lift off at the lowest possible airspeed and remain in ground effect while accelerating to Vx or Vy, as appropriate."},
    {"code":"CA.IV.C.S10","description":"Establish a pitch attitude for Vx or Vy, as appropriate, and maintain selected airspeed +/-5 knots during the climb."},
    {"code":"CA.IV.C.S11","description":"Configure the airplane after a positive rate of climb has been verified or in accordance with airplane manufacturer''s instructions."},
    {"code":"CA.IV.C.S12","description":"Maintain Vx or Vy, as appropriate, +/-5 knots to a safe maneuvering altitude."},
    {"code":"CA.IV.C.S13","description":"Maintain directional control and proper wind-drift correction throughout takeoff and climb."},
    {"code":"CA.IV.C.S14","description":"Comply with noise abatement procedures, as applicable."}
  ]$$::jsonb,
  '{ASEL}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IV.D', 'commercial', 'Takeoffs, Landings, and Go-Arounds', 'Soft-Field Approach and Landing',
  $$[
    {"code":"CA.IV.D.K1","description":"A stabilized approach, including energy management concepts."},
    {"code":"CA.IV.D.K2","description":"Effects of atmospheric conditions, including wind, on approach and landing performance."},
    {"code":"CA.IV.D.K3","description":"Wind correction techniques on approach and landing."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.D.R1","description":"Selection of runway based on pilot capability, airplane performance and limitations, available distance, and wind."},
    {"code":"CA.IV.D.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, landing surface/condition."},
    {"code":"CA.IV.D.R3","description":"Planning for: rejected landing and go-around, land and hold short operations (LAHSO)."},
    {"code":"CA.IV.D.R4","description":"Collision hazards."},
    {"code":"CA.IV.D.R5","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IV.D.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.D.S1","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IV.D.S2","description":"Make radio calls as appropriate."},
    {"code":"CA.IV.D.S3","description":"Ensure the airplane is aligned with the correct/assigned runway."},
    {"code":"CA.IV.D.S4","description":"Scan the landing runway and adjoining area for traffic and obstructions."},
    {"code":"CA.IV.D.S5","description":"Select and aim for a suitable touchdown point considering the wind conditions, landing surface, and obstructions."},
    {"code":"CA.IV.D.S6","description":"Establish the recommended approach and landing configuration, airspeed, and trim, and adjust pitch attitude and power as required to maintain a stabilized approach."},
    {"code":"CA.IV.D.S7","description":"Maintain manufacturer''s published approach airspeed or in its absence not more than 1.3 times the stalling speed or the minimum steady flight speed in the landing configuration (Vso), +/-5 knots with gust factor applied."},
    {"code":"CA.IV.D.S8","description":"Maintain directional control and appropriate crosswind correction throughout the approach and landing."},
    {"code":"CA.IV.D.S9","description":"Make smooth, timely, and correct control inputs during the round out and touchdown, and, for tricycle gear airplanes, keep the nose wheel off the surface until loss of elevator effectiveness."},
    {"code":"CA.IV.D.S10","description":"Touch down at a proper pitch attitude with minimum sink rate, no side drift, and with the airplane''s longitudinal axis aligned with the center of the runway."},
    {"code":"CA.IV.D.S11","description":"Maintain elevator as recommended by manufacturer during rollout and exit the soft area at a speed that would preclude sinking into the surface."},
    {"code":"CA.IV.D.S12","description":"Execute a timely go-around if the approach cannot be made within the tolerances specified above or for any other condition that may result in an unsafe approach or landing."},
    {"code":"CA.IV.D.S13","description":"Maintain proper position of the flight controls and sufficient speed to taxi while on the soft surface."}
  ]$$::jsonb,
  '{ASEL}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IV.E', 'commercial', 'Takeoffs, Landings, and Go-Arounds', 'Short-Field Takeoff and Maximum Performance Climb',
  $$[
    {"code":"CA.IV.E.K1","description":"Effects of atmospheric conditions, including wind, on takeoff and climb performance."},
    {"code":"CA.IV.E.K2","description":"Best angle of climb speed (Vx) and best rate of climb speed (Vy)."},
    {"code":"CA.IV.E.K3","description":"Appropriate airplane configuration."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.E.R1","description":"Selection of runway based on pilot capability, airplane performance and limitations, available distance, and wind."},
    {"code":"CA.IV.E.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, takeoff surface/condition."},
    {"code":"CA.IV.E.R3","description":"Abnormal operations, including planning for: rejected takeoff, potential engine failure in takeoff/climb phase of flight."},
    {"code":"CA.IV.E.R4","description":"Collision hazards."},
    {"code":"CA.IV.E.R5","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IV.E.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.E.S1","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IV.E.S2","description":"Make radio calls as appropriate."},
    {"code":"CA.IV.E.S3","description":"Verify assigned/correct runway."},
    {"code":"CA.IV.E.S4","description":"Determine wind direction with or without visible wind direction indicators."},
    {"code":"CA.IV.E.S5","description":"Position the flight controls for the existing wind, if applicable."},
    {"code":"CA.IV.E.S6","description":"Clear the area, taxi into takeoff position, and align the airplane on the runway centerline utilizing maximum available takeoff area."},
    {"code":"CA.IV.E.S7","description":"Apply brakes while setting engine power to achieve maximum performance."},
    {"code":"CA.IV.E.S8","description":"Confirm takeoff power prior to brake release and verify proper engine and flight instrument indications prior to rotation."},
    {"code":"CA.IV.E.S9","description":"Rotate and lift off at the recommended airspeed and accelerate to the recommended obstacle clearance airspeed or Vx, +/-5 knots."},
    {"code":"CA.IV.E.S10","description":"Establish a pitch attitude to maintain the recommended obstacle clearance airspeed or Vx, +/-5 knots until the obstacle is cleared or until the airplane is 50 feet above the surface."},
    {"code":"CA.IV.E.S11","description":"Establish a pitch attitude for Vy and accelerate to Vy +/-5 knots after clearing the obstacle or at 50 feet above ground level (AGL) if simulating an obstacle."},
    {"code":"CA.IV.E.S12","description":"Configure the airplane in accordance with the manufacturer''s guidance after a positive rate of climb has been verified."},
    {"code":"CA.IV.E.S13","description":"Maintain Vy +/-5 knots to a safe maneuvering altitude."},
    {"code":"CA.IV.E.S14","description":"Maintain directional control and proper wind-drift correction throughout takeoff and climb."},
    {"code":"CA.IV.E.S15","description":"Comply with noise abatement procedures, as applicable."}
  ]$$::jsonb,
  '{ASEL,AMEL}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IV.F', 'commercial', 'Takeoffs, Landings, and Go-Arounds', 'Short-Field Approach and Landing',
  $$[
    {"code":"CA.IV.F.K1","description":"A stabilized approach, including energy management concepts."},
    {"code":"CA.IV.F.K2","description":"Effects of atmospheric conditions, including wind, on approach and landing performance."},
    {"code":"CA.IV.F.K3","description":"Wind correction techniques on approach and landing."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.F.R1","description":"Selection of runway based on pilot capability, airplane performance and limitations, available distance, and wind."},
    {"code":"CA.IV.F.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, landing surface/condition."},
    {"code":"CA.IV.F.R3","description":"Planning for: rejected landing and go-around, land and hold short operations (LAHSO)."},
    {"code":"CA.IV.F.R4","description":"Collision hazards."},
    {"code":"CA.IV.F.R5","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IV.F.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.F.S1","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IV.F.S2","description":"Make radio calls as appropriate."},
    {"code":"CA.IV.F.S3","description":"Ensure the airplane is aligned with the correct/assigned runway."},
    {"code":"CA.IV.F.S4","description":"Scan the landing runway and adjoining area for traffic and obstructions."},
    {"code":"CA.IV.F.S5","description":"Select and aim for a suitable touchdown point considering the wind conditions, landing surface, and obstructions."},
    {"code":"CA.IV.F.S6","description":"Establish the recommended approach and landing configuration, airspeed, and trim, and adjust pitch attitude and power as required to maintain a stabilized approach."},
    {"code":"CA.IV.F.S7","description":"Maintain manufacturer''s published approach airspeed or in its absence not more than 1.3 times the stalling speed or the minimum steady flight speed in the landing configuration (Vso), +/-5 knots with gust factor applied."},
    {"code":"CA.IV.F.S8","description":"Maintain directional control and appropriate crosswind correction throughout the approach and landing."},
    {"code":"CA.IV.F.S9","description":"Make smooth, timely, and correct control application before, during, and after touchdown."},
    {"code":"CA.IV.F.S10","description":"Touch down at a proper pitch attitude within 100 feet beyond or on the specified point, threshold markings, or runway numbers, with no side drift, minimum float, and with the airplane''s longitudinal axis aligned with and over the runway centerline."},
    {"code":"CA.IV.F.S11","description":"Use manufacturer''s recommended procedures for airplane configuration and braking."},
    {"code":"CA.IV.F.S12","description":"Execute a timely go-around if the approach cannot be made within the tolerances specified above or for any other condition that may result in an unsafe approach or landing."},
    {"code":"CA.IV.F.S13","description":"Use runway incursion avoidance procedures, if applicable."}
  ]$$::jsonb,
  '{ASEL,AMEL}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IV.G', 'commercial', 'Takeoffs, Landings, and Go-Arounds', 'Confined Area Takeoff and Maximum Performance Climb',
  $$[
    {"code":"CA.IV.G.K1","description":"Effects of atmospheric conditions, including wind, on takeoff and climb performance."},
    {"code":"CA.IV.G.K2","description":"Best angle of climb speed (Vx) and best rate of climb speed (Vy)."},
    {"code":"CA.IV.G.K3","description":"Appropriate airplane configuration."},
    {"code":"CA.IV.G.K4","description":"Effects of water surface."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.G.R1","description":"Selection of takeoff path based on pilot capability, airplane performance and limitations, available distance, and wind."},
    {"code":"CA.IV.G.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, water surface/condition."},
    {"code":"CA.IV.G.R3","description":"Abnormal operations, including planning for: rejected takeoff, potential engine failure in takeoff/climb phase of flight."},
    {"code":"CA.IV.G.R4","description":"Collision hazards."},
    {"code":"CA.IV.G.R5","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IV.G.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.G.S1","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IV.G.S2","description":"Make radio calls as appropriate."},
    {"code":"CA.IV.G.S3","description":"Verify assigned/correct takeoff path."},
    {"code":"CA.IV.G.S4","description":"Determine wind direction with or without visible wind direction indicators."},
    {"code":"CA.IV.G.S5","description":"Position the flight controls for the existing wind, if applicable."},
    {"code":"CA.IV.G.S6","description":"Clear the area, taxi into takeoff position utilizing maximum available takeoff area, and align the airplane on the takeoff path, including retracting the water rudders, as appropriate."},
    {"code":"CA.IV.G.S7","description":"Advance the throttle smoothly to takeoff power and confirm proper engine and flight instrument indications prior to rotation."},
    {"code":"CA.IV.G.S8","description":"Establish a pitch attitude that maintains the most efficient planing/lift-off attitude and correct for porpoising and skipping."},
    {"code":"CA.IV.G.S9","description":"Avoid excessive water spray on the propeller(s)."},
    {"code":"CA.IV.G.S10","description":"Rotate and lift off at the recommended airspeed, and accelerate to the recommended obstacle clearance airspeed or Vx."},
    {"code":"CA.IV.G.S11","description":"Establish a pitch attitude to maintain the recommended obstacle clearance airspeed or Vx, +/-5 knots until the obstacle is cleared or until the airplane is 50 feet above the surface."},
    {"code":"CA.IV.G.S12","description":"Establish a pitch attitude for Vy and accelerate to Vy +/-5 knots after clearing the obstacle or at 50 feet above ground level (AGL) if simulating an obstacle."},
    {"code":"CA.IV.G.S13","description":"Retract flaps, if extended, after a positive rate of climb has been verified or in accordance with airplane manufacturer''s guidance."},
    {"code":"CA.IV.G.S14","description":"Maintain Vy +/-5 knots to a safe maneuvering altitude."},
    {"code":"CA.IV.G.S15","description":"Maintain directional control and proper wind-drift correction throughout takeoff and climb."},
    {"code":"CA.IV.G.S16","description":"Comply with noise abatement procedures, as applicable."}
  ]$$::jsonb,
  '{ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IV.H', 'commercial', 'Takeoffs, Landings, and Go-Arounds', 'Confined Area Approach and Landing',
  $$[
    {"code":"CA.IV.H.K1","description":"A stabilized approach, including energy management concepts."},
    {"code":"CA.IV.H.K2","description":"Effects of atmospheric conditions, including wind, on approach and landing performance."},
    {"code":"CA.IV.H.K3","description":"Wind correction techniques on approach and landing."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.H.R1","description":"Selection of approach path and touchdown area based on pilot capability, airplane performance and limitations, available distance, and wind."},
    {"code":"CA.IV.H.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, water surface/condition."},
    {"code":"CA.IV.H.R3","description":"Planning for a go-around and rejected landing."},
    {"code":"CA.IV.H.R4","description":"Collision hazards."},
    {"code":"CA.IV.H.R5","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IV.H.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.H.S1","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IV.H.S2","description":"Make radio calls as appropriate."},
    {"code":"CA.IV.H.S3","description":"Ensure the airplane is aligned for an approach to the correct/assigned landing surface."},
    {"code":"CA.IV.H.S4","description":"Scan the landing area for traffic and obstructions."},
    {"code":"CA.IV.H.S5","description":"Select and aim for a suitable touchdown point considering the wind conditions, landing surface, and obstructions."},
    {"code":"CA.IV.H.S6","description":"Establish the recommended approach and landing configuration, airspeed, and trim, and adjust pitch attitude and power as required to maintain a stabilized approach."},
    {"code":"CA.IV.H.S7","description":"Maintain manufacturer''s published approach airspeed or in its absence not more than 1.3 Vso, +10/-5 knots with gust factor applied."},
    {"code":"CA.IV.H.S8","description":"Maintain directional control and appropriate crosswind correction throughout the approach and landing."},
    {"code":"CA.IV.H.S9","description":"Make smooth, timely, and correct control application before, during, and after touchdown."},
    {"code":"CA.IV.H.S10","description":"Contact the water at the recommended airspeed with a proper pitch attitude for the surface conditions."},
    {"code":"CA.IV.H.S11","description":"Touch down at a proper pitch attitude, within 100 feet beyond or on the specified point, with no side drift, minimum float, and with the airplane''s longitudinal axis aligned with the projected landing path."},
    {"code":"CA.IV.H.S12","description":"Execute a timely go-around if the approach cannot be made within the tolerances specified above or for any other condition that may result in an unsafe approach or landing."},
    {"code":"CA.IV.H.S13","description":"Apply elevator control as necessary to stop in the shortest distance consistent with safety."}
  ]$$::jsonb,
  '{ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IV.I', 'commercial', 'Takeoffs, Landings, and Go-Arounds', 'Glassy Water Takeoff and Climb',
  $$[
    {"code":"CA.IV.I.K1","description":"Effects of atmospheric conditions, including wind, on takeoff and climb performance."},
    {"code":"CA.IV.I.K2","description":"Best angle of climb speed (Vx) and best rate of climb speed (Vy)."},
    {"code":"CA.IV.I.K3","description":"Appropriate airplane configuration."},
    {"code":"CA.IV.I.K4","description":"Appropriate use of glassy water takeoff and climb technique."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.I.R1","description":"Selection of takeoff path based on pilot capability, airplane performance and limitations, and available distance."},
    {"code":"CA.IV.I.R2","description":"Water surface/condition."},
    {"code":"CA.IV.I.R3","description":"Abnormal operations, including planning for: rejected takeoff, potential engine failure in takeoff/climb phase of flight."},
    {"code":"CA.IV.I.R4","description":"Collision hazards."},
    {"code":"CA.IV.I.R5","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IV.I.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.IV.I.R7","description":"Gear position in an amphibious airplane."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.I.S1","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IV.I.S2","description":"Make radio calls as appropriate."},
    {"code":"CA.IV.I.S3","description":"Position flight controls and configure the aircraft for the existing conditions."},
    {"code":"CA.IV.I.S4","description":"Clear the area, select appropriate takeoff path considering surface hazards or vessels and surface conditions, including retracting the water rudders, as appropriate, and advancing the throttle smoothly to takeoff power and confirming proper engine and flight instrument indications prior to rotation."},
    {"code":"CA.IV.I.S6","description":"Establish and maintain an appropriate planing attitude, directional control, and correct for porpoising, skipping, and increase in water drag."},
    {"code":"CA.IV.I.S7","description":"Avoid excessive water spray on the propeller(s)."},
    {"code":"CA.IV.I.S8","description":"Use appropriate techniques to lift seaplane from the water considering surface conditions."},
    {"code":"CA.IV.I.S9","description":"Establish proper attitude/airspeed and accelerate to Vy +/-5 knots during the climb."},
    {"code":"CA.IV.I.S10","description":"Configure the airplane after a positive rate of climb has been verified or in accordance with airplane manufacturer''s instructions."},
    {"code":"CA.IV.I.S11","description":"Maintain Vy +/-5 knots to a safe maneuvering altitude."},
    {"code":"CA.IV.I.S12","description":"Maintain directional control throughout takeoff and climb."}
  ]$$::jsonb,
  '{ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IV.J', 'commercial', 'Takeoffs, Landings, and Go-Arounds', 'Glassy Water Approach and Landing',
  $$[
    {"code":"CA.IV.J.K1","description":"A stabilized approach, including energy management concepts."},
    {"code":"CA.IV.J.K2","description":"Effects of atmospheric conditions, including wind, on approach and landing performance."},
    {"code":"CA.IV.J.K3","description":"When and why glassy water techniques are used."},
    {"code":"CA.IV.J.K4","description":"How a glassy water approach and landing is executed."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.J.R1","description":"Selection of approach path and touchdown area based on pilot capability, airplane performance and limitations, and available distance."},
    {"code":"CA.IV.J.R2","description":"Water surface/condition."},
    {"code":"CA.IV.J.R3","description":"Planning for a go-around and rejected landing."},
    {"code":"CA.IV.J.R4","description":"Collision hazards."},
    {"code":"CA.IV.J.R5","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IV.J.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.IV.J.R7","description":"Gear position in an amphibious airplane."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.J.S1","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IV.J.S2","description":"Make radio calls as appropriate."},
    {"code":"CA.IV.J.S3","description":"Scan the landing area for traffic and obstructions."},
    {"code":"CA.IV.J.S4","description":"Select a proper approach and landing path considering the landing surface, visual attitude references, water depth, and collision hazards."},
    {"code":"CA.IV.J.S5","description":"Establish the recommended approach and landing configuration, airspeed, and trim, and adjust pitch attitude and power as required to maintain a stabilized approach."},
    {"code":"CA.IV.J.S6","description":"Maintain manufacturer''s published approach airspeed or in its absence not more than 1.3 Vso, +/-5 knots."},
    {"code":"CA.IV.J.S7","description":"Make smooth, timely, and correct power and control adjustments to maintain proper pitch attitude and rate of descent to touchdown."},
    {"code":"CA.IV.J.S8","description":"Contact the water in a proper pitch attitude, and slow to idle taxi speed."},
    {"code":"CA.IV.J.S9","description":"Maintain directional control throughout the approach and landing."}
  ]$$::jsonb,
  '{ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IV.K', 'commercial', 'Takeoffs, Landings, and Go-Arounds', 'Rough Water Takeoff and Climb',
  $$[
    {"code":"CA.IV.K.K1","description":"Effects of atmospheric conditions, including wind, on takeoff and climb performance."},
    {"code":"CA.IV.K.K2","description":"Best angle of climb speed (Vx) and best rate of climb speed (Vy)."},
    {"code":"CA.IV.K.K3","description":"Appropriate airplane configuration."},
    {"code":"CA.IV.K.K4","description":"Appropriate use of rough water takeoff and climb technique."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.K.R1","description":"Selection of takeoff path based on pilot capability, airplane performance and limitations, available distance, and wind."},
    {"code":"CA.IV.K.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, water surface/condition."},
    {"code":"CA.IV.K.R3","description":"Abnormal operations, including planning for: rejected takeoff, potential engine failure in takeoff/climb phase of flight."},
    {"code":"CA.IV.K.R4","description":"Collision hazards."},
    {"code":"CA.IV.K.R5","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IV.K.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.IV.K.R7","description":"Gear position in an amphibious airplane."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.K.S1","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IV.K.S2","description":"Make radio calls as appropriate."},
    {"code":"CA.IV.K.S3","description":"Verify assigned/correct takeoff path."},
    {"code":"CA.IV.K.S4","description":"Determine wind direction with or without visible wind direction indicators."},
    {"code":"CA.IV.K.S5","description":"Position flight controls and configure the airplane for the existing conditions."},
    {"code":"CA.IV.K.S6","description":"Clear the area, select an appropriate takeoff path considering wind, swells, surface hazards, or vessels, including retracting the water rudders, as appropriate, and advancing the throttle smoothly to takeoff power and confirming proper engine and flight instrument indications prior to rotation."},
    {"code":"CA.IV.K.S8","description":"Establish and maintain an appropriate planing attitude, directional control, and correct for porpoising, skipping, and increase in water drag."},
    {"code":"CA.IV.K.S9","description":"Avoid excessive water spray on the propeller(s)."},
    {"code":"CA.IV.K.S10","description":"Lift off at minimum airspeed and accelerate to Vy +/-5 knots before leaving ground effect."},
    {"code":"CA.IV.K.S11","description":"Configure the airplane after a positive rate of climb has been verified or in accordance with airplane manufacturer''s instructions."},
    {"code":"CA.IV.K.S12","description":"Maintain Vy +/-5 knots to a safe maneuvering altitude."},
    {"code":"CA.IV.K.S13","description":"Maintain directional control and proper wind-drift correction throughout takeoff and climb."}
  ]$$::jsonb,
  '{ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IV.L', 'commercial', 'Takeoffs, Landings, and Go-Arounds', 'Rough Water Approach and Landing',
  $$[
    {"code":"CA.IV.L.K1","description":"A stabilized approach, including energy management concepts."},
    {"code":"CA.IV.L.K2","description":"Effects of atmospheric conditions, including wind, on approach and landing performance."},
    {"code":"CA.IV.L.K3","description":"Wind correction techniques on approach and landing."},
    {"code":"CA.IV.L.K4","description":"When and why rough water techniques are used."},
    {"code":"CA.IV.L.K5","description":"How to perform a proper rough water approach and landing."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.L.R1","description":"Selection of approach path and touchdown area based on pilot capability, airplane performance and limitations, available distance, and wind."},
    {"code":"CA.IV.L.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, water surface/condition."},
    {"code":"CA.IV.L.R3","description":"Planning for a go-around and rejected landing."},
    {"code":"CA.IV.L.R4","description":"Collision hazards."},
    {"code":"CA.IV.L.R5","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IV.L.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.IV.L.R7","description":"Gear position in an amphibious airplane."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.L.S1","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IV.L.S2","description":"Make radio calls as appropriate."},
    {"code":"CA.IV.L.S3","description":"Ensure the airplane is aligned with the correct/assigned waterway."},
    {"code":"CA.IV.L.S4","description":"Scan the landing area for traffic and obstructions."},
    {"code":"CA.IV.L.S5","description":"Select and aim for a suitable touchdown point considering the wind conditions, landing surface, and obstructions."},
    {"code":"CA.IV.L.S6","description":"Establish the recommended approach and landing configuration, airspeed, and trim, and adjust pitch attitude and power as required to maintain a stabilized approach."},
    {"code":"CA.IV.L.S7","description":"Maintain manufacturer''s published approach airspeed or in its absence not more than 1.3 times the stalling speed or the minimum steady flight speed in the landing configuration (Vso), +/-5 knots with gust factor applied."},
    {"code":"CA.IV.L.S8","description":"Maintain directional control and appropriate crosswind correction throughout the approach and landing."},
    {"code":"CA.IV.L.S9","description":"Make smooth, timely, and correct power and control adjustments to maintain proper pitch attitude and rate of descent to touchdown."},
    {"code":"CA.IV.L.S10","description":"Contact the water in a proper pitch attitude, considering the type of rough water."}
  ]$$::jsonb,
  '{ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IV.M', 'commercial', 'Takeoffs, Landings, and Go-Arounds', 'Power-Off 180 Degree Accuracy Approach and Landing',
  $$[
    {"code":"CA.IV.M.K1","description":"A stabilized approach, including energy management concepts."},
    {"code":"CA.IV.M.K2","description":"Effects of atmospheric conditions, including wind, on approach and landing."},
    {"code":"CA.IV.M.K3","description":"Wind correction techniques on approach and landing."},
    {"code":"CA.IV.M.K4","description":"Purpose of power-off accuracy approach."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.M.R1","description":"Selection of runway/landing surface, approach path, and touchdown area based on pilot capability, aircraft performance and limitations, available distance, and wind."},
    {"code":"CA.IV.M.R2","description":"Effects of: crosswind, windshear, tailwind, wake turbulence, landing surface/condition."},
    {"code":"CA.IV.M.R3","description":"Planning for: rejected landing and go-around, land and hold short operations (LAHSO)."},
    {"code":"CA.IV.M.R4","description":"Collision hazards."},
    {"code":"CA.IV.M.R5","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IV.M.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.IV.M.R7","description":"Forward slip operations, including fuel flowage, tail stalls with flaps, and airspeed control."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.M.S1","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IV.M.S2","description":"Make radio calls as appropriate."},
    {"code":"CA.IV.M.S3","description":"Plan and follow a flightpath to the selected landing area considering altitude, wind, terrain, and obstructions."},
    {"code":"CA.IV.M.S4","description":"Select the most suitable touchdown point based on wind, landing surface, obstructions, and aircraft limitations."},
    {"code":"CA.IV.M.S5","description":"Position airplane on downwind leg, parallel to landing runway."},
    {"code":"CA.IV.M.S6","description":"Correctly configure the airplane."},
    {"code":"CA.IV.M.S7","description":"As necessary, correlate crosswind with direction of forward slip and transition to side slip before touchdown."},
    {"code":"CA.IV.M.S8","description":"Touch down at a proper pitch attitude, within 200 feet beyond or on the specified point with no side drift and with the airplane''s longitudinal axis aligned with and over the runway centerline or landing path, as applicable."}
  ]$$::jsonb,
  '{ASEL,ASES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IV.N', 'commercial', 'Takeoffs, Landings, and Go-Arounds', 'Go-Around/Rejected Landing',
  $$[
    {"code":"CA.IV.N.K1","description":"A stabilized approach, including energy management concepts."},
    {"code":"CA.IV.N.K2","description":"Effects of atmospheric conditions, including wind and density altitude, on a go-around or rejected landing."},
    {"code":"CA.IV.N.K3","description":"Wind correction techniques on takeoff/departure and approach/landing."},
    {"code":"CA.IV.N.K4","description":"Go-around/rejected landing procedures, the importance of a timely decision, and appropriate airspeeds for the maneuver."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.N.R1","description":"Delayed recognition of the need for a go-around/rejected landing."},
    {"code":"CA.IV.N.R2","description":"Delayed performance of a go-around at low altitude."},
    {"code":"CA.IV.N.R3","description":"Power application."},
    {"code":"CA.IV.N.R4","description":"Configuring the airplane."},
    {"code":"CA.IV.N.R5","description":"Collision hazards."},
    {"code":"CA.IV.N.R6","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IV.N.R7","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.IV.N.R8","description":"Runway incursion."},
    {"code":"CA.IV.N.R9","description":"Managing a go-around/rejected landing after accepting a LAHSO clearance."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IV.N.S1","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IV.N.S2","description":"Make radio calls as appropriate."},
    {"code":"CA.IV.N.S3","description":"Make a timely decision to discontinue the approach to landing."},
    {"code":"CA.IV.N.S4","description":"Apply takeoff power immediately and transition to climb pitch attitude for Vx or Vy as appropriate +/-5 knots."},
    {"code":"CA.IV.N.S5","description":"Configure the airplane after a positive rate of climb has been verified or in accordance with airplane manufacturer''s instructions."},
    {"code":"CA.IV.N.S6","description":"Maneuver to the side of the runway/landing area when necessary to clear and avoid conflicting traffic."},
    {"code":"CA.IV.N.S7","description":"Maintain Vy +/-5 knots to a safe maneuvering altitude."},
    {"code":"CA.IV.N.S8","description":"Maintain directional control and proper wind-drift correction throughout the climb."},
    {"code":"CA.IV.N.S9","description":"Use runway incursion avoidance procedures, if applicable."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ============================================================
-- AREA V: Performance Maneuvers and Ground Reference Maneuvers (5 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.V.A', 'commercial', 'Performance Maneuvers and Ground Reference Maneuvers', 'Steep Turns',
  $$[
    {"code":"CA.V.A.K1","description":"How to conduct a proper steep turn."},
    {"code":"CA.V.A.K2","description":"Aerodynamics associated with steep turns, including: maintaining coordinated flight, overbanking tendencies, maneuvering speed, including the impact of weight changes, load factor and accelerated stalls, rate and radius of turn."}
  ]$$::jsonb,
  $$[
    {"code":"CA.V.A.R1","description":"Division of attention between aircraft control and orientation."},
    {"code":"CA.V.A.R2","description":"Collision hazards."},
    {"code":"CA.V.A.R3","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.V.A.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.V.A.R5","description":"Uncoordinated flight."}
  ]$$::jsonb,
  $$[
    {"code":"CA.V.A.S1","description":"Clear the area."},
    {"code":"CA.V.A.S2","description":"Establish the manufacturer''s recommended airspeed; or if one is not available, an airspeed not to exceed maneuvering speed (Va)."},
    {"code":"CA.V.A.S3","description":"Roll into a coordinated 360 degree steep turn with approximately a 50 degree bank."},
    {"code":"CA.V.A.S4","description":"Perform the Task in the opposite direction."},
    {"code":"CA.V.A.S5","description":"Maintain the entry altitude +/-100 feet, airspeed +/-10 knots, bank +/-5 degrees, and roll out on the entry heading +/-10 degrees."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.V.B', 'commercial', 'Performance Maneuvers and Ground Reference Maneuvers', 'Steep Spiral',
  $$[
    {"code":"CA.V.B.K1","description":"Relationship to emergency landing procedures."},
    {"code":"CA.V.B.K2","description":"Maintaining a constant radius about a point."},
    {"code":"CA.V.B.K3","description":"Effects of wind on ground track and relation to a ground reference."}
  ]$$::jsonb,
  $$[
    {"code":"CA.V.B.R1","description":"Division of attention between aircraft control and orientation."},
    {"code":"CA.V.B.R2","description":"Collision hazards."},
    {"code":"CA.V.B.R3","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.V.B.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.V.B.R5","description":"Uncoordinated flight."},
    {"code":"CA.V.B.R6","description":"Effects of wind."},
    {"code":"CA.V.B.R7","description":"Airframe or airspeed limitations."}
  ]$$::jsonb,
  $$[
    {"code":"CA.V.B.S1","description":"Clear the area."},
    {"code":"CA.V.B.S2","description":"Select an altitude sufficient to continue through a series of at least three, 360 degree turns."},
    {"code":"CA.V.B.S3","description":"Establish and maintain a steep spiral, not to exceed 60 degree angle of bank, to maintain a constant radius about a suitable ground reference point."},
    {"code":"CA.V.B.S4","description":"Apply wind-drift correction to track a constant radius circle around selected reference point with bank not to exceed 60 degrees a steepest point in turn."},
    {"code":"CA.V.B.S5","description":"Divide attention between airplane control, traffic avoidance and the ground track while maintaining coordinated flight."},
    {"code":"CA.V.B.S6","description":"Maintain the specified airspeed, +/-10 knots and roll out toward an object or specified heading, +/-10 degrees, and complete the maneuver no lower than 1,500 feet above ground level (AGL)."}
  ]$$::jsonb,
  '{ASEL,ASES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.V.C', 'commercial', 'Performance Maneuvers and Ground Reference Maneuvers', 'Chandelles',
  $$[
    {"code":"CA.V.C.K1","description":"How to conduct proper chandelles."},
    {"code":"CA.V.C.K2","description":"Aerodynamics associated with chandelles, including: maintaining coordinated flight, overbanking tendencies, maneuvering speed, including the impact of weight changes, accelerated stalls."},
    {"code":"CA.V.C.K3","description":"Appropriate airplane configuration for maximum performance climb."},
    {"code":"CA.V.C.K4","description":"Proper pitch control required for continuously decreasing airspeed."}
  ]$$::jsonb,
  $$[
    {"code":"CA.V.C.R1","description":"Division of attention between aircraft control and orientation."},
    {"code":"CA.V.C.R2","description":"Collision hazards."},
    {"code":"CA.V.C.R3","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.V.C.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.V.C.R5","description":"Uncoordinated flight."},
    {"code":"CA.V.C.R6","description":"Energy management."},
    {"code":"CA.V.C.R7","description":"Rate and radius of turn with confined area operations."}
  ]$$::jsonb,
  $$[
    {"code":"CA.V.C.S1","description":"Clear the area."},
    {"code":"CA.V.C.S2","description":"Select an altitude that allows the maneuver to be performed no lower than 1,500 feet above ground level (AGL)."},
    {"code":"CA.V.C.S3","description":"Establish the appropriate entry configuration, power, and airspeed."},
    {"code":"CA.V.C.S4","description":"Establish the angle of bank at approximately 30 degrees."},
    {"code":"CA.V.C.S5","description":"Simultaneously apply power and pitch to maintain a smooth, coordinated climbing turn, in either direction, to the 90 degree point, with a constant bank and continuously decreasing airspeed."},
    {"code":"CA.V.C.S6","description":"Begin a coordinated constant rate rollout from the 90 degree point to the 180 degree point maintaining power and a constant pitch attitude."},
    {"code":"CA.V.C.S7","description":"Complete rollout at the 180 degree point, +/-10 degrees just above a stall airspeed, and maintaining that airspeed momentarily avoiding a stall."},
    {"code":"CA.V.C.S8","description":"Resume a straight-and-level flight with minimum loss of altitude."}
  ]$$::jsonb,
  '{ASEL,ASES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.V.D', 'commercial', 'Performance Maneuvers and Ground Reference Maneuvers', 'Lazy Eights',
  $$[
    {"code":"CA.V.D.K1","description":"How to conduct proper lazy eights."},
    {"code":"CA.V.D.K2","description":"Aerodynamics associated with lazy eights, including how to maintain coordinated flight."},
    {"code":"CA.V.D.K3","description":"Performance and airspeed limitations."},
    {"code":"CA.V.D.K4","description":"Phases of the lazy eight maneuver from entry to recovery."}
  ]$$::jsonb,
  $$[
    {"code":"CA.V.D.R1","description":"Division of attention between aircraft control and orientation."},
    {"code":"CA.V.D.R2","description":"Collision hazards."},
    {"code":"CA.V.D.R3","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.V.D.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.V.D.R5","description":"Uncoordinated flight."},
    {"code":"CA.V.D.R6","description":"Energy management."},
    {"code":"CA.V.D.R7","description":"Accelerated stalls."}
  ]$$::jsonb,
  $$[
    {"code":"CA.V.D.S1","description":"Clear the area."},
    {"code":"CA.V.D.S2","description":"Select an altitude that allows the maneuver to be performed no lower than 1,500 feet above ground level (AGL)."},
    {"code":"CA.V.D.S3","description":"Establish the recommended entry configuration, power, and airspeed."},
    {"code":"CA.V.D.S4","description":"Maintain coordinated flight throughout the maneuver."},
    {"code":"CA.V.D.S5","description":"Complete the maneuver in accordance with the following: approximately 30 degree bank at the steepest point, constant change of pitch and roll rate and airspeed, altitude at 180 degree point, +/-100 feet from entry altitude, airspeed at the 180 degree point, +/-10 knots from entry airspeed, heading at the 180 degree point, +/-10 degrees."},
    {"code":"CA.V.D.S6","description":"Continue the maneuver through the number of symmetrical loops specified, then resume straight-and-level flight."}
  ]$$::jsonb,
  '{ASEL,ASES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.V.E', 'commercial', 'Performance Maneuvers and Ground Reference Maneuvers', 'Eights on Pylons',
  $$[
    {"code":"CA.V.E.K1","description":"Purpose of eights on pylons."},
    {"code":"CA.V.E.K2","description":"Aerodynamics associated with the eights on pylons, including coordinated and uncoordinated flight."},
    {"code":"CA.V.E.K3","description":"Pivotal altitude and factors that affect it."},
    {"code":"CA.V.E.K4","description":"Effect of wind on ground track."},
    {"code":"CA.V.E.K5","description":"Phases of the eights on pylons maneuver from entry to recovery."}
  ]$$::jsonb,
  $$[
    {"code":"CA.V.E.R1","description":"Division of attention between aircraft control and orientation."},
    {"code":"CA.V.E.R2","description":"Collision hazards."},
    {"code":"CA.V.E.R3","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.V.E.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.V.E.R5","description":"Uncoordinated flight."},
    {"code":"CA.V.E.R6","description":"Energy management."},
    {"code":"CA.V.E.R7","description":"Emergency landing considerations."}
  ]$$::jsonb,
  $$[
    {"code":"CA.V.E.S1","description":"Clear the area."},
    {"code":"CA.V.E.S2","description":"Determine the approximate pivotal altitude."},
    {"code":"CA.V.E.S3","description":"Select suitable pylons that permits straight-and-level flight between the pylons."},
    {"code":"CA.V.E.S4","description":"Enter the maneuver in the correct direction and position using an appropriate altitude and airspeed."},
    {"code":"CA.V.E.S5","description":"Establish the correct bank angle for the conditions, not to exceed 40 degrees."},
    {"code":"CA.V.E.S6","description":"Apply smooth and continuous corrections so that the line-of-sight reference line remains on the pylon."},
    {"code":"CA.V.E.S7","description":"Divide attention between accurate, coordinated airplane control and outside visual references."},
    {"code":"CA.V.E.S8","description":"Maintain pylon position using appropriate pivotal altitude, avoiding slips and skids."}
  ]$$::jsonb,
  '{ASEL,ASES}'
);

-- ============================================================
-- AREA VI: Navigation (4 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.VI.A', 'commercial', 'Navigation', 'Pilotage and Dead Reckoning',
  $$[
    {"code":"CA.VI.A.K1","description":"Pilotage and dead reckoning."},
    {"code":"CA.VI.A.K2","description":"Magnetic compass errors."},
    {"code":"CA.VI.A.K3","description":"Topography."},
    {"code":"CA.VI.A.K4","description":"Selection of appropriate: route, altitude(s), checkpoints."},
    {"code":"CA.VI.A.K5","description":"Plotting a course, including: determining heading, speed, and course, wind correction angle, estimating time, speed, and distance, true airspeed and density altitude."},
    {"code":"CA.VI.A.K6","description":"Power setting selection."},
    {"code":"CA.VI.A.K7","description":"Planned calculations versus actual results and required corrections."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VI.A.R1","description":"Collision hazards."},
    {"code":"CA.VI.A.R2","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.VI.A.R3","description":"Unplanned fuel/power consumption, if applicable."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VI.A.S1","description":"Prepare and use a flight log."},
    {"code":"CA.VI.A.S2","description":"Navigate by pilotage."},
    {"code":"CA.VI.A.S3","description":"Navigate by means of pre-computed headings, groundspeeds, elapsed time, and reference to landmarks or checkpoints."},
    {"code":"CA.VI.A.S4","description":"Use the magnetic direction indicator in navigation, including turns to headings."},
    {"code":"CA.VI.A.S5","description":"Verify position within two nautical miles of the flight-planned route."},
    {"code":"CA.VI.A.S6","description":"Arrive at the en route checkpoints within three minutes of the initial or revised estimated time of arrival (ETA) and provide a destination estimate."},
    {"code":"CA.VI.A.S7","description":"Maintain the selected altitude, +/-100 feet and heading, +/-10 degrees."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.VI.B', 'commercial', 'Navigation', 'Navigation Systems and Radar Services',
  $$[
    {"code":"CA.VI.B.K1","description":"Ground-based navigation (identification, orientation, course determination, equipment, tests, regulations, interference, appropriate use of navigation data, and signal integrity)."},
    {"code":"CA.VI.B.K2","description":"Satellite-based navigation (e.g., equipment, regulations, authorized use of databases, and Receiver Autonomous Integrity Monitoring (RAIM))."},
    {"code":"CA.VI.B.K3","description":"Radar assistance to visual flight rules (VFR) aircraft (e.g., operations, equipment, available services, traffic advisories)."},
    {"code":"CA.VI.B.K4","description":"Transponder (Mode(s) A, C, and S) and Automatic Dependent Surveillance-Broadcast (ADS-B)."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VI.B.R1","description":"Management of automated navigation and autoflight systems."},
    {"code":"CA.VI.B.R2","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.VI.B.R3","description":"Limitations of the navigation system in use."},
    {"code":"CA.VI.B.R4","description":"Loss of a navigation signal."},
    {"code":"CA.VI.B.R5","description":"Use of an electronic flight bag (EFB), if used."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VI.B.S1","description":"Use an airborne electronic navigation system."},
    {"code":"CA.VI.B.S2","description":"Determine the airplane''s position using the navigation system."},
    {"code":"CA.VI.B.S3","description":"Intercept and track a given course, radial, or bearing."},
    {"code":"CA.VI.B.S4","description":"Recognize and describe the indication of station or waypoint passage."},
    {"code":"CA.VI.B.S5","description":"Recognize signal loss or interference and take appropriate action, if applicable."},
    {"code":"CA.VI.B.S6","description":"Use proper communication procedures when utilizing radar services."},
    {"code":"CA.VI.B.S7","description":"Maintain the appropriate altitude, +/-100 feet and heading, +/-10 degrees."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.VI.C', 'commercial', 'Navigation', 'Diversion',
  $$[
    {"code":"CA.VI.C.K1","description":"Selecting an alternate destination."},
    {"code":"CA.VI.C.K2","description":"Situations that require deviations from flight plan or air traffic control (ATC) instructions."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VI.C.R1","description":"Collision hazards."},
    {"code":"CA.VI.C.R2","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.VI.C.R3","description":"Circumstances that would make diversion prudent."},
    {"code":"CA.VI.C.R4","description":"Selecting an appropriate airport or seaplane base."},
    {"code":"CA.VI.C.R5","description":"Using available resources (e.g., automation, ATC, and flight deck planning aids)."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VI.C.S1","description":"Select a suitable destination and route for diversion."},
    {"code":"CA.VI.C.S2","description":"Make a reasonable estimate of heading, groundspeed, arrival time, and fuel required to the divert to destination."},
    {"code":"CA.VI.C.S3","description":"Maintain the appropriate altitude, +/-100 feet and heading, +/-10 degrees."},
    {"code":"CA.VI.C.S4","description":"Update/interpret weather in flight."},
    {"code":"CA.VI.C.S5","description":"Use displays of digital weather and aeronautical information, as applicable to maintain situational awareness."},
    {"code":"CA.VI.C.S6","description":"Promptly divert toward the destination."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.VI.D', 'commercial', 'Navigation', 'Lost Procedures',
  $$[
    {"code":"CA.VI.D.K1","description":"Methods to determine position."},
    {"code":"CA.VI.D.K2","description":"Assistance available if lost (e.g., radar services, communication procedures)."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VI.D.R1","description":"Collision hazards."},
    {"code":"CA.VI.D.R2","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.VI.D.R3","description":"Recording times over waypoints."},
    {"code":"CA.VI.D.R4","description":"When to seek assistance or declare an emergency in a deteriorating situation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VI.D.S1","description":"Use an appropriate method to determine position."},
    {"code":"CA.VI.D.S2","description":"Maintain an appropriate heading and climb as necessary."},
    {"code":"CA.VI.D.S3","description":"Identify prominent landmarks."},
    {"code":"CA.VI.D.S4","description":"Use navigation systems/facilities or contact an ATC facility for assistance."},
    {"code":"CA.VI.D.S5","description":"Select an appropriate course of action."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ============================================================
-- AREA VII: Slow Flight and Stalls (5 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.VII.A', 'commercial', 'Slow Flight and Stalls', 'Maneuvering During Slow Flight',
  $$[
    {"code":"CA.VII.A.K1","description":"Aerodynamics associated with slow flight in various airplane configurations, including the relationship between angle of attack, airspeed, load factor, power setting, airplane weight and center of gravity, airplane attitude, and yaw effects."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VII.A.R1","description":"Inadvertent slow flight and flight with a stall warning, which could lead to loss of control."},
    {"code":"CA.VII.A.R2","description":"Range and limitations of stall warning indicators (e.g., aircraft buffet, stall horn, etc.)."},
    {"code":"CA.VII.A.R3","description":"Uncoordinated flight."},
    {"code":"CA.VII.A.R4","description":"Effect of environmental elements on airplane performance (e.g., turbulence, microbursts, and high-density altitude)."},
    {"code":"CA.VII.A.R5","description":"Collision hazards."},
    {"code":"CA.VII.A.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VII.A.S1","description":"Clear the area."},
    {"code":"CA.VII.A.S2","description":"Select an entry altitude that allows the Task to be completed no lower than 1,500 feet above ground level (AGL) (ASEL, ASES) or 3,000 feet AGL (AMEL, AMES)."},
    {"code":"CA.VII.A.S3","description":"Establish and maintain an airspeed at which any further increase in angle of attack, increase in load factor, or reduction in power, would result in a stall warning (e.g., aircraft buffet, stall horn, etc.)."},
    {"code":"CA.VII.A.S4","description":"Accomplish coordinated straight-and-level flight, turns, climbs, and descents with the aircraft configured as specified by the evaluator without a stall warning (e.g., aircraft buffet, stall horn, etc.)."},
    {"code":"CA.VII.A.S5","description":"Maintain the specified altitude, +/-50 feet; specified heading, +/-10 degrees; airspeed, +5/-0 knots; and specified angle of bank, +/-5 degrees."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.VII.B', 'commercial', 'Slow Flight and Stalls', 'Power-Off Stalls',
  $$[
    {"code":"CA.VII.B.K1","description":"Aerodynamics associated with stalls in various airplane configurations, including the relationship between angle of attack, airspeed, load factor, power setting, airplane weight and center of gravity, airplane attitude, and yaw effects."},
    {"code":"CA.VII.B.K2","description":"Stall characteristics as they relate to airplane design, and recognition impending stall and full stall indications using sight, sound, or feel."},
    {"code":"CA.VII.B.K3","description":"Factors and situations that can lead to a power-off stall and actions that can be taken to prevent it."},
    {"code":"CA.VII.B.K4","description":"Fundamentals of stall recovery."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VII.B.R1","description":"Factors and situations that could lead to an inadvertent power-off stall, spin, and loss of control."},
    {"code":"CA.VII.B.R2","description":"Range and limitations of stall warning indicators (e.g., aircraft buffet, stall horn, etc.)."},
    {"code":"CA.VII.B.R3","description":"Stall warning(s) during normal operations."},
    {"code":"CA.VII.B.R4","description":"Stall recovery procedure."},
    {"code":"CA.VII.B.R5","description":"Secondary stalls, accelerated stalls, and cross-control stalls."},
    {"code":"CA.VII.B.R6","description":"Effect of environmental elements on airplane performance related to power-off stalls (e.g., turbulence, microbursts, and high-density altitude)."},
    {"code":"CA.VII.B.R7","description":"Collision hazards."},
    {"code":"CA.VII.B.R8","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VII.B.S1","description":"Clear the area."},
    {"code":"CA.VII.B.S2","description":"Select an entry altitude that allows the Task to be completed no lower than 1,500 feet above ground level (AGL) (ASEL, ASES) or 3,000 feet AGL (AMEL, AMES)."},
    {"code":"CA.VII.B.S3","description":"Configure the airplane in the approach or landing configuration, as specified by the evaluator, and maintain coordinated flight throughout the maneuver."},
    {"code":"CA.VII.B.S4","description":"Establish a stabilized descent."},
    {"code":"CA.VII.B.S5","description":"Transition smoothly from the approach or landing attitude to a pitch attitude that induces a stall."},
    {"code":"CA.VII.B.S6","description":"Maintain a specified heading, +/-10 degrees if in straight flight; maintain a specified angle of bank not to exceed 20 degrees, +/-5 degrees if in turning flight, until an impending or full stall occurs, as specified by the evaluator."},
    {"code":"CA.VII.B.S7","description":"Acknowledge the cues at the first indication of a stall (e.g., aircraft buffet, stall horn, etc.)."},
    {"code":"CA.VII.B.S8","description":"Recover at the first indication of a stall or after a full stall has occurred, as specified by the evaluator."},
    {"code":"CA.VII.B.S9","description":"Configure the airplane as recommended by the manufacturer, and accelerate to best angle of climb speed (Vx) or best rate of climb speed (Vy)."},
    {"code":"CA.VII.B.S10","description":"Return to the altitude, heading, and airspeed specified by the evaluator."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.VII.C', 'commercial', 'Slow Flight and Stalls', 'Power-On Stalls',
  $$[
    {"code":"CA.VII.C.K1","description":"Aerodynamics associated with stalls in various airplane configurations, including the relationship between angle of attack, airspeed, load factor, power setting, airplane weight and center of gravity, airplane attitude, and yaw effects."},
    {"code":"CA.VII.C.K2","description":"Stall characteristics as they relate to airplane design, and recognition impending stall and full stall indications using sight, sound, or feel."},
    {"code":"CA.VII.C.K3","description":"Factors and situations that can lead to a power-on stall and actions that can be taken to prevent it."},
    {"code":"CA.VII.C.K4","description":"Fundamentals of stall recovery."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VII.C.R1","description":"Factors and situations that could lead to an inadvertent power-on stall, spin, and loss of control."},
    {"code":"CA.VII.C.R2","description":"Range and limitations of stall warning indicators (e.g., aircraft buffet, stall horn, etc.)."},
    {"code":"CA.VII.C.R3","description":"Stall warning(s) during normal operations."},
    {"code":"CA.VII.C.R4","description":"Stall recovery procedure."},
    {"code":"CA.VII.C.R5","description":"Secondary stalls, accelerated stalls, elevator trim stalls, and cross-control stalls."},
    {"code":"CA.VII.C.R6","description":"Effect of environmental elements on airplane performance related to power-on stalls (e.g., turbulence, microbursts, and high-density altitude)."},
    {"code":"CA.VII.C.R7","description":"Collision hazards."},
    {"code":"CA.VII.C.R8","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VII.C.S1","description":"Clear the area."},
    {"code":"CA.VII.C.S2","description":"Select an entry altitude that allows the Task to be completed no lower than 1,500 feet above ground level (AGL) (ASEL, ASES) or 3,000 feet AGL (AMEL, AMES)."},
    {"code":"CA.VII.C.S3","description":"Establish the takeoff, departure, or cruise configuration, as specified by the evaluator, and maintain coordinated flight throughout the maneuver."},
    {"code":"CA.VII.C.S4","description":"Set power to no less than 65 percent power."},
    {"code":"CA.VII.C.S5","description":"Transition smoothly from the takeoff or departure attitude to the pitch attitude that induces a stall."},
    {"code":"CA.VII.C.S6","description":"Maintain a specified heading +/-10 degrees if in straight flight; maintain a specified angle of bank not to exceed 20 degrees, +/-10 degrees if in turning flight, until an impending or full stall is reached, as specified by the evaluator."},
    {"code":"CA.VII.C.S7","description":"Acknowledge the cues at the first indication of a stall (e.g., aircraft buffet, stall horn, etc.)."},
    {"code":"CA.VII.C.S8","description":"Recover at the first indication of a stall or after a full stall has occurred, as specified by the evaluator."},
    {"code":"CA.VII.C.S9","description":"Configure the airplane as recommended by the manufacturer, and accelerate to best angle of climb speed (Vx) or best rate of climb speed (Vy)."},
    {"code":"CA.VII.C.S10","description":"Return to the altitude, heading, and airspeed specified by the evaluator."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.VII.D', 'commercial', 'Slow Flight and Stalls', 'Accelerated Stalls',
  $$[
    {"code":"CA.VII.D.K1","description":"Aerodynamics associated with accelerated stalls in various airplane configurations, including the relationship between angle of attack, airspeed, load factor, power setting, airplane weight and center of gravity, airplane attitude, and yaw effects."},
    {"code":"CA.VII.D.K2","description":"Stall characteristics as they relate to airplane design, and recognition impending stall and full stall indications using sight, sound, or feel."},
    {"code":"CA.VII.D.K3","description":"Factors leading to an accelerated stall and preventive actions."},
    {"code":"CA.VII.D.K4","description":"Fundamentals of stall recovery."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VII.D.R1","description":"Factors and situations that could lead to an inadvertent accelerated stall, spin, and loss of control."},
    {"code":"CA.VII.D.R2","description":"Range and limitations of stall warning indicators (e.g., aircraft buffet, stall horn, etc.)."},
    {"code":"CA.VII.D.R3","description":"Stall warning(s) during normal operations."},
    {"code":"CA.VII.D.R4","description":"Stall recovery procedure."},
    {"code":"CA.VII.D.R5","description":"Secondary stalls, cross-control stalls, and spins."},
    {"code":"CA.VII.D.R6","description":"Effect of environmental elements on airplane performance related to accelerated stalls (e.g., turbulence, microbursts, and high-density altitude)."},
    {"code":"CA.VII.D.R7","description":"Collision hazards."},
    {"code":"CA.VII.D.R8","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VII.D.S1","description":"Clear the area."},
    {"code":"CA.VII.D.S2","description":"Select an entry altitude that allows the Task to be completed no lower than 3,000 feet above ground level (AGL)."},
    {"code":"CA.VII.D.S3","description":"Establish the configuration as specified by the evaluator."},
    {"code":"CA.VII.D.S4","description":"Set power appropriate for the configuration, such that the airspeed does not exceed the maneuvering speed (Va) or any other applicable Pilot''s Operating Handbook (POH)/Airplane Flight Manual (AFM) limitation."},
    {"code":"CA.VII.D.S5","description":"Establish and maintain a coordinated turn in a 45 degree bank, increasing elevator back pressure smoothly and firmly until an impending stall is reached."},
    {"code":"CA.VII.D.S6","description":"Acknowledge the cues at the first indication of a stall (e.g., aircraft buffet, stall horn, etc.)."},
    {"code":"CA.VII.D.S7","description":"Execute a stall recovery in accordance with procedures set forth in the Pilot''s Operating Handbook (POH)/Flight Manual (FM)."},
    {"code":"CA.VII.D.S8","description":"Configure the airplane as recommended by the manufacturer, and accelerate to best angle of climb speed (Vx) or best rate of climb speed (Vy)."},
    {"code":"CA.VII.D.S9","description":"Return to the altitude, heading, and airspeed specified by the evaluator."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.VII.E', 'commercial', 'Slow Flight and Stalls', 'Spin Awareness',
  $$[
    {"code":"CA.VII.E.K1","description":"Aerodynamics associated with spins in various airplane configurations, including the relationship between angle of attack, airspeed, load factor, power setting, airplane weight and center of gravity, airplane attitude, and yaw effects."},
    {"code":"CA.VII.E.K2","description":"What causes a spin and how to identify the entry, incipient, and developed phases of a spin."},
    {"code":"CA.VII.E.K3","description":"Spin recovery procedure."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VII.E.R1","description":"Factors and situations that could lead to inadvertent spin and loss of control."},
    {"code":"CA.VII.E.R2","description":"Range and limitations of stall warning indicators (e.g., aircraft buffet, stall horn, etc.)."},
    {"code":"CA.VII.E.R3","description":"Spin recovery procedure."},
    {"code":"CA.VII.E.R4","description":"Effect of environmental elements on airplane performance related to spins (e.g., turbulence, microbursts, and high-density altitude)."},
    {"code":"CA.VII.E.R5","description":"Collision hazards."},
    {"code":"CA.VII.E.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ============================================================
-- AREA VIII: High-Altitude Operations (2 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.VIII.A', 'commercial', 'High-Altitude Operations', 'Supplemental Oxygen',
  $$[
    {"code":"CA.VIII.A.K1","description":"Regulatory requirements for supplemental oxygen use by flight crew and passengers."},
    {"code":"CA.VIII.A.K2","description":"Physiological factors, including: impairment, symptoms of hypoxia, time of useful consciousness (TUC)."},
    {"code":"CA.VIII.A.K3","description":"Operational factors, including: characteristics, limitations, and applicability of continuous flow, demand, and pressure-demand oxygen systems; differences between and identification of aviator''s breathing oxygen and other types of oxygen; precautions when using supplemental oxygen systems."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VIII.A.R1","description":"High altitude flight."},
    {"code":"CA.VIII.A.R2","description":"Use of supplemental oxygen."},
    {"code":"CA.VIII.A.R3","description":"Management of compressed gas containers."},
    {"code":"CA.VIII.A.R4","description":"Combustion hazards in an oxygen-rich environment."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VIII.A.S1","description":"Determine the quantity of supplemental oxygen required in a scenario given by the evaluator."},
    {"code":"CA.VIII.A.S2","description":"Operate or simulate operation of the installed or portable oxygen equipment in the airplane, if installed or available."},
    {"code":"CA.VIII.A.S3","description":"Brief passengers on use of supplemental oxygen equipment in a scenario given by the evaluator."},
    {"code":"CA.VIII.A.S4","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.VIII.B', 'commercial', 'High-Altitude Operations', 'Pressurization',
  $$[
    {"code":"CA.VIII.B.K1","description":"Fundamental concepts of aircraft pressurization system, including failure modes."},
    {"code":"CA.VIII.B.K2","description":"Physiological factors, including: impairment, symptoms of hypoxia, time of useful consciousness (TUC), effects of rapid decompression on crew and passengers."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VIII.B.R1","description":"High altitude flight."},
    {"code":"CA.VIII.B.R2","description":"Malfunction of pressurization system, if equipment is installed."}
  ]$$::jsonb,
  $$[
    {"code":"CA.VIII.B.S1","description":"Operate the pressurization system, if equipment is installed."},
    {"code":"CA.VIII.B.S2","description":"Respond appropriately to simulated pressurization malfunctions, if equipment is installed."},
    {"code":"CA.VIII.B.S3","description":"Brief passengers on use of supplemental oxygen in the case of pressurization malfunction, if equipment is installed."},
    {"code":"CA.VIII.B.S4","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ============================================================
-- AREA IX: Emergency Operations (7 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IX.A', 'commercial', 'Emergency Operations', 'Emergency Descent',
  $$[
    {"code":"CA.IX.A.K1","description":"Situations that would require an emergency descent (e.g., depressurization, smoke, or engine fire)."},
    {"code":"CA.IX.A.K2","description":"Immediate action items and emergency procedures."},
    {"code":"CA.IX.A.K3","description":"Airspeed, including airspeed limitations."},
    {"code":"CA.IX.A.K4","description":"Aircraft performance and limitations."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IX.A.R1","description":"Altitude, wind, terrain, obstructions, gliding distance, and available landing distance considerations."},
    {"code":"CA.IX.A.R2","description":"Collision hazards."},
    {"code":"CA.IX.A.R3","description":"Configuring the airplane."},
    {"code":"CA.IX.A.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IX.A.S1","description":"Clear the area."},
    {"code":"CA.IX.A.S2","description":"Establish and maintain the appropriate airspeed and configuration appropriate to the scenario specified by the evaluator and as covered in Pilot''s Operating Handbook (POH)/Airplane Flight Manual (AFM) for the emergency descent."},
    {"code":"CA.IX.A.S3","description":"Maintain orientation, divide attention appropriately, and plan and execute a smooth recovery."},
    {"code":"CA.IX.A.S4","description":"Use bank angle between 30 degrees and 45 degrees to maintain positive load factors during the descent."},
    {"code":"CA.IX.A.S5","description":"Maintain appropriate airspeed +0/-10 knots, and level off at a specified altitude +/-100 feet."},
    {"code":"CA.IX.A.S6","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.IX.A.S7","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IX.B', 'commercial', 'Emergency Operations', 'Emergency Approach and Landing (Simulated)',
  $$[
    {"code":"CA.IX.B.K1","description":"Immediate action items and emergency procedures."},
    {"code":"CA.IX.B.K2","description":"Airspeed, including: importance of best glide speed and its relationship to distance, difference between best glide speed and minimum sink speed, effects of wind on glide distance."},
    {"code":"CA.IX.B.K3","description":"Effects of atmospheric conditions on emergency approach and landing."},
    {"code":"CA.IX.B.K4","description":"A stabilized approach, including energy management concepts."},
    {"code":"CA.IX.B.K5","description":"Emergency Locator Transmitters (ELTs) and other emergency locating devices."},
    {"code":"CA.IX.B.K6","description":"Air traffic control (ATC) services to aircraft in distress."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IX.B.R1","description":"Altitude, wind, terrain, obstructions, gliding distance, and available landing distance considerations."},
    {"code":"CA.IX.B.R2","description":"Following or changing the planned flightpath to the selected landing area."},
    {"code":"CA.IX.B.R3","description":"Collision hazards."},
    {"code":"CA.IX.B.R4","description":"Configuring the airplane."},
    {"code":"CA.IX.B.R5","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IX.B.R6","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IX.B.S1","description":"Establish and maintain the recommended best glide airspeed, +/-10 knots."},
    {"code":"CA.IX.B.S2","description":"Configure the airplane in accordance with the Pilot''s Operating Handbook (POH)/Airplane Flight Manual (AFM) and existing conditions."},
    {"code":"CA.IX.B.S3","description":"Select a suitable landing area considering altitude, wind, terrain, obstructions, and available glide distance."},
    {"code":"CA.IX.B.S4","description":"Plan and follow a flightpath to the selected landing area considering altitude, wind, terrain, and obstructions."},
    {"code":"CA.IX.B.S5","description":"Prepare for landing as specified by the evaluator."},
    {"code":"CA.IX.B.S6","description":"Complete the appropriate checklist(s)."}
  ]$$::jsonb,
  '{ASEL,ASES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IX.C', 'commercial', 'Emergency Operations', 'Systems and Equipment Malfunctions',
  $$[
    {"code":"CA.IX.C.K1","description":"Causes of partial or complete power loss related to the specific type of powerplant(s)."},
    {"code":"CA.IX.C.K2","description":"System and equipment malfunctions specific to the aircraft, including: electrical malfunction, vacuum/pressure and associated flight instrument malfunctions, pitot-static system malfunction, electronic flight deck display malfunction, landing gear or flap malfunction, inoperative trim."},
    {"code":"CA.IX.C.K3","description":"Causes and remedies for smoke or fire onboard the aircraft."},
    {"code":"CA.IX.C.K4","description":"Any other system specific to the aircraft (e.g., supplemental oxygen, deicing)."},
    {"code":"CA.IX.C.K5","description":"Inadvertent door or window opening."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IX.C.R1","description":"Checklist usage for a system or equipment malfunction."},
    {"code":"CA.IX.C.R2","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.IX.C.R3","description":"Undesired aircraft state."},
    {"code":"CA.IX.C.R4","description":"Startle response."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IX.C.S1","description":"Determine appropriate action for simulated emergencies specified by the evaluator, from at least three of the elements or sub-elements listed in K1 through K5."},
    {"code":"CA.IX.C.S2","description":"Complete the appropriate checklist(s)."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IX.D', 'commercial', 'Emergency Operations', 'Emergency Equipment and Survival Gear',
  $$[
    {"code":"CA.IX.D.K1","description":"Emergency Locator Transmitter (ELT) operations, limitations, and testing requirements."},
    {"code":"CA.IX.D.K2","description":"Fire extinguisher operations and limitations."},
    {"code":"CA.IX.D.K3","description":"Emergency equipment and survival gear needed for: climate extremes (hot/cold), mountainous terrain, overwater operations."},
    {"code":"CA.IX.D.K4","description":"When to deploy a ballistic parachute and associated passenger briefings, if equipped."},
    {"code":"CA.IX.D.K5","description":"When to activate an emergency auto-land system and brief passengers, if equipped."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IX.D.R1","description":"Survival gear (water, clothing, shelter) for 48 to 72 hours."},
    {"code":"CA.IX.D.R2","description":"Use of a ballistic parachute system."},
    {"code":"CA.IX.D.R3","description":"Use of an emergency auto-land system, if installed."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IX.D.S1","description":"Identify appropriate equipment and personal gear."},
    {"code":"CA.IX.D.S2","description":"Brief passengers on proper use of on-board emergency equipment and survival gear."},
    {"code":"CA.IX.D.S3","description":"Simulate ballistic parachute deployment procedures, if equipped."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IX.E', 'commercial', 'Emergency Operations', 'Engine Failure During Takeoff Before VMC (Simulated)',
  $$[
    {"code":"CA.IX.E.K1","description":"Factors affecting minimum controllable speed (VMC)."},
    {"code":"CA.IX.E.K2","description":"VMC (red line) and best single-engine rate of climb airspeed (VYSE) (blue line)."},
    {"code":"CA.IX.E.K3","description":"Accelerate/stop distance."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IX.E.R1","description":"Potential engine failure during takeoff."},
    {"code":"CA.IX.E.R2","description":"Configuring the airplane."},
    {"code":"CA.IX.E.R3","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IX.E.S1","description":"Close the throttles smoothly and promptly when a simulated engine failure occurs."},
    {"code":"CA.IX.E.S2","description":"Maintain directional control and apply brakes (AMEL), or flight controls (AMES), as necessary."}
  ]$$::jsonb,
  '{AMEL,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IX.F', 'commercial', 'Emergency Operations', 'Engine Failure After Liftoff (Simulated)',
  $$[
    {"code":"CA.IX.F.K1","description":"Factors affecting minimum controllable speed (VMC)."},
    {"code":"CA.IX.F.K2","description":"VMC (red line), VYSE (blue line), and safe single-engine speed (VSSE)."},
    {"code":"CA.IX.F.K3","description":"Accelerate/stop and accelerate/go distances."},
    {"code":"CA.IX.F.K4","description":"How to identify, verify, feather, and secure an inoperative engine."},
    {"code":"CA.IX.F.K5","description":"Importance of drag reduction, including propeller feathering, gear and flap retraction, the manufacturer''s recommended control input and its relation to zero sideslip."},
    {"code":"CA.IX.F.K6","description":"Simulated propeller feathering and the evaluator''s zero-thrust procedures and responsibilities."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IX.F.R1","description":"Potential engine failure after lift-off."},
    {"code":"CA.IX.F.R2","description":"Collision hazards."},
    {"code":"CA.IX.F.R3","description":"Configuring the airplane."},
    {"code":"CA.IX.F.R4","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IX.F.R5","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IX.F.S1","description":"Promptly recognize an engine failure, maintain control, and use appropriate emergency procedures."},
    {"code":"CA.IX.F.S2","description":"Establish VYSE; if obstructions are present, establish best single-engine angle of climb speed (VXSE) or VMC +5 knots, whichever is greater, until obstructions are cleared. Then transition to VYSE."},
    {"code":"CA.IX.F.S3","description":"Reduce drag by retracting landing gear and flaps in accordance with the manufacturer''s guidance."},
    {"code":"CA.IX.F.S4","description":"Simulate feathering the propeller on the inoperative engine (evaluator should then establish zero thrust on the inoperative engine)."},
    {"code":"CA.IX.F.S5","description":"Use flight controls in the proper combination as recommended by the manufacturer, or as required to maintain best performance, and trim as required."},
    {"code":"CA.IX.F.S6","description":"Monitor the operating engine and aircraft systems and make adjustments as necessary."},
    {"code":"CA.IX.F.S7","description":"Recognize the airplane''s performance capabilities. If a climb is not possible at VYSE, maintain VYSE and return to the departure airport for landing, or initiate an approach to the most suitable landing area available."},
    {"code":"CA.IX.F.S8","description":"Simulate securing the inoperative engine."},
    {"code":"CA.IX.F.S9","description":"Maintain heading +/-10 degrees and airspeed +/-5 knots."},
    {"code":"CA.IX.F.S10","description":"Complete the appropriate checklist(s)."}
  ]$$::jsonb,
  '{AMEL,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.IX.G', 'commercial', 'Emergency Operations', 'Approach and Landing with an Inoperative Engine (Simulated)',
  $$[
    {"code":"CA.IX.G.K1","description":"Factors affecting minimum controllable speed (VMC)."},
    {"code":"CA.IX.G.K2","description":"VMC (red line) and best single-engine rate of climb airspeed (VYSE) (blue line)."},
    {"code":"CA.IX.G.K3","description":"How to identify, verify, feather, and secure an inoperative engine."},
    {"code":"CA.IX.G.K4","description":"Importance of drag reduction, including propeller feathering, gear and flap retraction, the manufacturer''s recommended control input and its relation to zero sideslip."},
    {"code":"CA.IX.G.K5","description":"Applicant responsibilities during simulated feathering."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IX.G.R1","description":"Potential engine failure inflight or during an approach."},
    {"code":"CA.IX.G.R2","description":"Collision hazards."},
    {"code":"CA.IX.G.R3","description":"Configuring the airplane."},
    {"code":"CA.IX.G.R4","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.IX.G.R5","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.IX.G.R6","description":"Possible single-engine go-around."}
  ]$$::jsonb,
  $$[
    {"code":"CA.IX.G.S1","description":"Promptly recognize an engine failure and maintain positive aircraft control."},
    {"code":"CA.IX.G.S2","description":"Set the engine controls, reduce drag, identify and verify the inoperative engine, and simulate feathering of the propeller on the inoperative engine (evaluator should then establish zero thrust on the inoperative engine)."},
    {"code":"CA.IX.G.S3","description":"Use flight controls in the proper combination as recommended by the manufacturer, or as required to maintain best performance, and trim as required."},
    {"code":"CA.IX.G.S4","description":"Follow the manufacturer''s recommended emergency procedures and complete the appropriate checklist."},
    {"code":"CA.IX.G.S5","description":"Monitor the operating engine and aircraft systems and make adjustments as necessary."},
    {"code":"CA.IX.G.S6","description":"Maintain the manufacturer''s recommended approach airspeed +/-5 knots in the landing configuration with a stabilized approach, until landing is assured."},
    {"code":"CA.IX.G.S7","description":"Make smooth, timely, and correct control application before, during, and after touchdown."},
    {"code":"CA.IX.G.S8","description":"Touch down on the first one-third of available runway/landing surface, with no drift, and the airplane''s longitudinal axis aligned with and over the runway center or landing path."},
    {"code":"CA.IX.G.S9","description":"Maintain directional control and appropriate crosswind correction throughout the approach and landing."},
    {"code":"CA.IX.G.S10","description":"Complete the appropriate checklist(s)."}
  ]$$::jsonb,
  '{AMEL,AMES}'
);

-- ============================================================
-- AREA X: Multiengine Operations (4 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.X.A', 'commercial', 'Multiengine Operations', 'Maneuvering with One Engine Inoperative',
  $$[
    {"code":"CA.X.A.K1","description":"Factors affecting minimum controllable speed (VMC)."},
    {"code":"CA.X.A.K2","description":"VMC (red line) and best single-engine rate of climb airspeed (VYSE) (blue line)."},
    {"code":"CA.X.A.K3","description":"How to identify, verify, feather, and secure an inoperative engine."},
    {"code":"CA.X.A.K4","description":"Importance of drag reduction, including propeller feathering, gear and flap retraction, the manufacturer''s recommended control input and its relation to zero sideslip."},
    {"code":"CA.X.A.K5","description":"Feathering, securing, unfeathering, and restarting."}
  ]$$::jsonb,
  $$[
    {"code":"CA.X.A.R1","description":"Potential engine failure during flight."},
    {"code":"CA.X.A.R2","description":"Collision hazards."},
    {"code":"CA.X.A.R3","description":"Configuring the airplane."},
    {"code":"CA.X.A.R4","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.X.A.R5","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.X.A.S1","description":"Recognize an engine failure, maintain control, use manufacturer''s memory item procedures, and use appropriate emergency procedures."},
    {"code":"CA.X.A.S2","description":"Set the engine controls, identify and verify the inoperative engine, and feather the appropriate propeller."},
    {"code":"CA.X.A.S3","description":"Use flight controls in the proper combination as recommended by the manufacturer, or as required to maintain best performance, and trim as required."},
    {"code":"CA.X.A.S4","description":"Attempt to determine and resolve the reason for the engine failure."},
    {"code":"CA.X.A.S5","description":"Secure the inoperative engine and monitor the operating engine and make necessary adjustments."},
    {"code":"CA.X.A.S6","description":"Restart the inoperative engine using manufacturer''s restart procedures."},
    {"code":"CA.X.A.S7","description":"Maintain altitude +/-100 feet or minimum sink rate if applicable, airspeed +/-10 knots, and selected headings +/-10 degrees."},
    {"code":"CA.X.A.S8","description":"Complete the appropriate checklist(s)."}
  ]$$::jsonb,
  '{AMEL,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.X.B', 'commercial', 'Multiengine Operations', 'VMC Demonstration',
  $$[
    {"code":"CA.X.B.K1","description":"Factors affecting VMC and how VMC differs from stall speed (Vs)."},
    {"code":"CA.X.B.K2","description":"VMC (red line), VYSE (blue line), and safe single-engine speed (VSSE)."},
    {"code":"CA.X.B.K3","description":"Cause of loss of directional control at airspeeds below VMC."},
    {"code":"CA.X.B.K4","description":"Proper procedures for maneuver entry and safe recovery."}
  ]$$::jsonb,
  $$[
    {"code":"CA.X.B.R1","description":"Configuring the airplane."},
    {"code":"CA.X.B.R2","description":"Maneuvering with one engine inoperative."},
    {"code":"CA.X.B.R3","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.X.B.S1","description":"Configure the airplane in accordance with the manufacturer''s recommendations, in the absence of the manufacturer''s recommendations, then at safe single-engine speed (VSSE/VYSE), as appropriate, and: landing gear retracted, flaps set for takeoff, cowl flaps set for takeoff, trim set for takeoff, propellers set for high revolutions per minute (rpm), power on critical engine reduced to idle and propeller windmilling, power on operating engine set to takeoff or maximum available power."},
    {"code":"CA.X.B.S2","description":"Establish a single-engine climb attitude with the airspeed at approximately 10 knots above VSSE."},
    {"code":"CA.X.B.S3","description":"Establish a bank angle not to exceed 5 degrees toward the operating engine, as required for best performance and controllability."},
    {"code":"CA.X.B.S4","description":"Increase the pitch attitude slowly to reduce the airspeed at approximately 1 knot per second while applying increased rudder pressure as needed to maintain directional control."},
    {"code":"CA.X.B.S5","description":"Recognize and recover at the first indication of loss of directional control, stall warning, or buffet."},
    {"code":"CA.X.B.S6","description":"Recover promptly by simultaneously reducing power sufficiently on the operating engine, decreasing the angle of attack as necessary to regain airspeed and directional control, and without adding power on the simulated failed engine."},
    {"code":"CA.X.B.S7","description":"Recover within 20 degrees of entry heading."},
    {"code":"CA.X.B.S8","description":"Advance power smoothly on the operating engine and accelerate to VSSE/VYSE, as appropriate, +/-5 knots during recovery."}
  ]$$::jsonb,
  '{AMEL,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.X.C', 'commercial', 'Multiengine Operations', 'One Engine Inoperative (Simulated) (solely by Reference to Instruments) During Straight-and-Level Flight and Turns',
  $$[
    {"code":"CA.X.C.K1","description":"Procedures used if engine failure occurs during straight-and-level flight and turns while on instruments."}
  ]$$::jsonb,
  $$[
    {"code":"CA.X.C.R1","description":"Identification of the inoperative engine."},
    {"code":"CA.X.C.R2","description":"Inability to climb or maintain altitude with an inoperative engine."},
    {"code":"CA.X.C.R3","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.X.C.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.X.C.R5","description":"Fuel management during single-engine operation."}
  ]$$::jsonb,
  $$[
    {"code":"CA.X.C.S1","description":"Promptly recognize an engine failure and maintain positive aircraft control."},
    {"code":"CA.X.C.S2","description":"Set the engine controls, reduce drag, identify and verify the inoperative engine, and simulate feathering of the propeller on the inoperative engine (evaluator should then establish zero thrust on the inoperative engine)."},
    {"code":"CA.X.C.S3","description":"Establish the best engine-inoperative airspeed and trim the airplane."},
    {"code":"CA.X.C.S4","description":"Use flight controls in the proper combination as recommended by the manufacturer, or as required to maintain best performance, and trim as required."},
    {"code":"CA.X.C.S5","description":"Verify the prescribed checklist procedures used for securing the inoperative engine."},
    {"code":"CA.X.C.S6","description":"Attempt to determine and resolve the reason for the engine failure."},
    {"code":"CA.X.C.S7","description":"Monitor engine functions and make necessary adjustments."},
    {"code":"CA.X.C.S8","description":"Maintain the specified altitude +/-100 feet or minimum sink rate if applicable, airspeed +/-10 knots, and the specified heading +/-10 degrees."},
    {"code":"CA.X.C.S9","description":"Assess the aircraft''s performance capability and decide an appropriate action to ensure a safe landing."},
    {"code":"CA.X.C.S10","description":"Avoid loss of airplane control or attempted flight contrary to the engine-inoperative operating limitations of the airplane."},
    {"code":"CA.X.C.S11","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{AMEL,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.X.D', 'commercial', 'Multiengine Operations', 'Instrument Approach and Landing with an Inoperative Engine (Simulated)',
  $$[
    {"code":"CA.X.D.K1","description":"Instrument approach procedures with one engine inoperative."}
  ]$$::jsonb,
  $$[
    {"code":"CA.X.D.R1","description":"Potential engine failure during approach and landing."},
    {"code":"CA.X.D.R2","description":"Collision hazards."},
    {"code":"CA.X.D.R3","description":"Configuring the airplane."},
    {"code":"CA.X.D.R4","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"CA.X.D.R5","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"CA.X.D.R6","description":"Performing a go-around/rejected landing with an engine failure."}
  ]$$::jsonb,
  $$[
    {"code":"CA.X.D.S1","description":"Promptly recognize an engine failure and maintain positive aircraft control."},
    {"code":"CA.X.D.S2","description":"Set the engine controls, reduce drag, identify and verify the inoperative engine, and simulate feathering of the propeller on the inoperative engine (evaluator should then establish zero thrust on the inoperative engine)."},
    {"code":"CA.X.D.S3","description":"Use flight controls in the proper combination as recommended by the manufacturer, or as required to maintain best performance, and trim as required."},
    {"code":"CA.X.D.S4","description":"Follow the manufacturer''s recommended emergency procedures and complete the appropriate checklist."},
    {"code":"CA.X.D.S5","description":"Monitor the operating engine and aircraft systems and make adjustments as necessary."},
    {"code":"CA.X.D.S6","description":"Request and follow an actual or a simulated air traffic control (ATC) clearance for an instrument approach."},
    {"code":"CA.X.D.S7","description":"Maintain altitude +/-100 feet or minimum sink rate if applicable, airspeed +/-10 knots, and selected heading +/-10 degrees."},
    {"code":"CA.X.D.S8","description":"Establish a rate of descent that ensures arrival at the minimum descent altitude (MDA) or decision altitude (DA)/decision height (DH) with the airplane in a position from which a descent to a landing on the intended runway can be made, either straight in or circling as appropriate."},
    {"code":"CA.X.D.S9","description":"On final approach segment, maintain vertical (as applicable) and lateral guidance within 3/4-scale deflection."},
    {"code":"CA.X.D.S10","description":"Avoid loss of airplane control or attempted flight contrary to the operating limitations of the airplane."},
    {"code":"CA.X.D.S11","description":"Comply with the published criteria for the aircraft approach category if circling."},
    {"code":"CA.X.D.S12","description":"Execute a landing."},
    {"code":"CA.X.D.S13","description":"Complete the appropriate checklist(s)."}
  ]$$::jsonb,
  '{AMEL,AMES}'
);

-- ============================================================
-- AREA XI: Postflight Procedures (2 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.XI.A', 'commercial', 'Postflight Procedures', 'After Landing, Parking, and Securing',
  $$[
    {"code":"CA.XI.A.K1","description":"Airplane shutdown, securing, and postflight inspection."},
    {"code":"CA.XI.A.K2","description":"Documenting in-flight/postflight discrepancies."}
  ]$$::jsonb,
  $$[
    {"code":"CA.XI.A.R1","description":"Activities and distractions."},
    {"code":"CA.XI.A.R3","description":"Airport specific security procedures."},
    {"code":"CA.XI.A.R4","description":"Disembarking passengers safely on the ramp and monitoring passenger movement while on the ramp."}
  ]$$::jsonb,
  $$[
    {"code":"CA.XI.A.S2","description":"Park in an appropriate area, considering the safety of nearby persons and property."},
    {"code":"CA.XI.A.S3","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.XI.A.S4","description":"Conduct a postflight inspection and document discrepancies and servicing requirements, if any."},
    {"code":"CA.XI.A.S5","description":"Secure the airplane."}
  ]$$::jsonb,
  '{ASEL,AMEL}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'CA.XI.B', 'commercial', 'Postflight Procedures', 'Seaplane Post-Landing Procedures',
  $$[
    {"code":"CA.XI.B.K1","description":"Mooring."},
    {"code":"CA.XI.B.K2","description":"Docking."},
    {"code":"CA.XI.B.K3","description":"Anchoring."},
    {"code":"CA.XI.B.K4","description":"Beaching/ramping."},
    {"code":"CA.XI.B.K5","description":"Postflight inspection, recording of in-flight/postflight discrepancies."}
  ]$$::jsonb,
  $$[
    {"code":"CA.XI.B.R1","description":"Activities and distractions."},
    {"code":"CA.XI.B.R3","description":"Seaplane base specific security procedures, if applicable."},
    {"code":"CA.XI.B.R4","description":"Disembarking passengers safely on the ramp and monitoring passenger movement while on the ramp."}
  ]$$::jsonb,
  $$[
    {"code":"CA.XI.B.S1","description":"If anchoring, select a suitable area considering seaplane movement, water depth, tide, wind, and weather changes. Use an adequate number of anchors and lines of sufficient strength and length to ensure the seaplane''s security."},
    {"code":"CA.XI.B.S2","description":"If not anchoring, approach the dock/mooring buoy or beach/ramp in the proper direction and at a safe speed, considering water depth, tide, current, and wind."},
    {"code":"CA.XI.B.S3","description":"Complete the appropriate checklist(s)."},
    {"code":"CA.XI.B.S4","description":"Conduct a postflight inspection and document discrepancies and servicing requirements, if any."},
    {"code":"CA.XI.B.S5","description":"Secure the seaplane considering the effect of wind, waves, and changes in water level, or comply with applicable after landing, parking, and securing procedures if operating an amphibious airplane on land."}
  ]$$::jsonb,
  '{ASES,AMES}'
);

COMMIT;
