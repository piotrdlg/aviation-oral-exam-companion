-- Seed all Instrument Rating ACS tasks (FAA-S-ACS-8C, November 2023)
-- Each element is a top-level K/R/S item; sub-elements are folded into parent descriptions.
-- Archived elements (IR.IV.B.R2, IR.VII.C.R2) are omitted.

BEGIN;

-- ============================================================
-- AREA I: Preflight Preparation (3 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.I.A', 'instrument', 'Preflight Preparation', 'Pilot Qualifications',
  $$[
    {"code":"IR.I.A.K1","description":"Certification requirements, recency of experience, and recordkeeping."},
    {"code":"IR.I.A.K2","description":"Privileges and limitations."},
    {"code":"IR.I.A.K3","description":"Part 68 BasicMed privileges and limitations."}
  ]$$::jsonb,
  $$[
    {"code":"IR.I.A.R1","description":"Proficiency versus currency."},
    {"code":"IR.I.A.R2","description":"Personal minimums."},
    {"code":"IR.I.A.R3","description":"Fitness for flight and physiological factors that might affect the pilot''s ability to fly under instrument conditions."},
    {"code":"IR.I.A.R4","description":"Flying unfamiliar aircraft or operating with unfamiliar flight display systems and avionics."}
  ]$$::jsonb,
  $$[
    {"code":"IR.I.A.S1","description":"Apply requirements to act as pilot-in-command (PIC) under Instrument Flight Rules (IFR) in a scenario given by the evaluator."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.I.B', 'instrument', 'Preflight Preparation', 'Weather Information',
  $$[
    {"code":"IR.I.B.K1","description":"Sources of weather data (e.g., National Weather Service, Flight Service) for flight planning purposes."},
    {"code":"IR.I.B.K2","description":"Acceptable weather products and resources required for preflight planning, current and forecast weather for departure, en route, and arrival phases of flight such as: Airport Observations (METAR and SPECI) and Pilot Observations (PIREP), Surface Analysis Chart, Ceiling and Visibility Chart (CVA), Terminal Aerodrome Forecasts (TAF), Graphical Forecasts for Aviation (GFA), Wind and Temperature Aloft Forecast (FB), Convective Outlook (AC), Inflight Aviation Weather Advisories including Airmen''s Meteorological Information (AIRMET), Significant Meteorological Information (SIGMET), and Convective SIGMET"},
    {"code":"IR.I.B.K3","description":"Meteorology applicable to the departure, en route, alternate and destination for flights conducted under Instrument Flight Rules (IFR) to include expected climate and hazardous conditions such as: atmospheric composition and stability, wind (e.g., windshear, mountain wave, factors affecting wind, etc.), temperature and heat exchange, moisture/precipitation, weather system formation including air masses and fronts, clouds, turbulence, thunderstorms and microbursts, icing and freezing level information, fog/mist, frost, obstructions to visibility (e.g., smoke, haze, volcanic ash, etc.)"},
    {"code":"IR.I.B.K4","description":"Flight deck instrument displays of digital weather and aeronautical information."}
  ]$$::jsonb,
  $$[
    {"code":"IR.I.B.R1","description":"Making the go/no-go and continue/divert decisions, including: circumstances that would make diversion prudent, personal weather minimums, hazardous weather conditions including known or forecast icing or turbulence aloft"},
    {"code":"IR.I.B.R2","description":"Use and limitations of: installed onboard weather equipment, aviation weather reports and forecasts, inflight weather resources"}
  ]$$::jsonb,
  $$[
    {"code":"IR.I.B.S1","description":"Use available aviation weather resources to obtain an adequate weather briefing."},
    {"code":"IR.I.B.S2","description":"Analyze the implications of at least three of the conditions listed in K3a through K3l, using actual weather or weather conditions provided by the evaluator."},
    {"code":"IR.I.B.S3","description":"Correlate weather information to make a go/no-go decision."},
    {"code":"IR.I.B.S4","description":"Determine whether an alternate airport is required, and, if required, whether the selected alternate airport meets regulatory requirements."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.I.C', 'instrument', 'Preflight Preparation', 'Cross-Country Flight Planning',
  $$[
    {"code":"IR.I.C.K1","description":"Route planning, including consideration of: available navigational facilities, special use airspace, preferred routes, primary and alternate airports, enroute charts, Chart Supplements, NOTAMS, Terminal Procedures Publications (TPP)"},
    {"code":"IR.I.C.K2","description":"Altitude selection accounting for terrain and obstacles, glide distance of airplane, IFR cruising altitudes, effect of wind, and oxygen requirements."},
    {"code":"IR.I.C.K3","description":"Calculating: time, climb and descent rates, course, distance, heading, true airspeed, and groundspeed; estimated time of arrival, including conversion to universal coordinated time (UTC); fuel requirements, including reserve"},
    {"code":"IR.I.C.K4","description":"Elements of an IFR flight plan."},
    {"code":"IR.I.C.K5","description":"Procedures for activating and closing an IFR flight plan in controlled and uncontrolled airspace."}
  ]$$::jsonb,
  $$[
    {"code":"IR.I.C.R1","description":"Pilot."},
    {"code":"IR.I.C.R2","description":"Aircraft."},
    {"code":"IR.I.C.R3","description":"Environment (e.g., weather, airports, airspace, terrain, obstacles)."},
    {"code":"IR.I.C.R4","description":"External pressures."},
    {"code":"IR.I.C.R5","description":"Limitations of air traffic control (ATC) services."},
    {"code":"IR.I.C.R6","description":"Limitations of electronic planning applications and programs."},
    {"code":"IR.I.C.R7","description":"Fuel planning."}
  ]$$::jsonb,
  $$[
    {"code":"IR.I.C.S1","description":"Prepare, present, and explain a cross-country flight plan assigned by the evaluator including a risk analysis based on real time weather, which includes calculating time en route and fuel considering factors such as power settings, operating altitude, wind, fuel reserve requirements, and weight and balance requirements."},
    {"code":"IR.I.C.S2","description":"Recalculate fuel reserves based on a scenario provided by the evaluator."},
    {"code":"IR.I.C.S3","description":"Create a navigation plan and simulate filing an IFR flight plan."},
    {"code":"IR.I.C.S4","description":"Interpret departure, arrival, en route, and approach procedures with reference to appropriate and current charts."},
    {"code":"IR.I.C.S5","description":"Recognize simulated wing contamination due to airframe icing and demonstrate knowledge of the adverse effects of airframe icing during pre-takeoff, takeoff, cruise, and landing phases of flight as well as the corrective actions."},
    {"code":"IR.I.C.S6","description":"Apply pertinent information from appropriate and current aeronautical charts, Chart Supplements; Notices to Air Missions (NOTAMs) relative to airport, runway and taxiway closures; and other flight publications."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ============================================================
-- AREA II: Preflight Procedures (3 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.II.A', 'instrument', 'Preflight Procedures', 'Aircraft Systems Related to Instrument Flight Rules (IFR) Operations',
  $$[
    {"code":"IR.II.A.K1","description":"The general operational characteristics and limitations of applicable anti-icing and deicing systems, including airframe, propeller, intake, fuel, and pitot-static systems."},
    {"code":"IR.II.A.K2","description":"Flight control systems."}
  ]$$::jsonb,
  $$[
    {"code":"IR.II.A.R1","description":"Operations in icing conditions."},
    {"code":"IR.II.A.R2","description":"Limitations of anti-icing and deicing systems."},
    {"code":"IR.II.A.R3","description":"Use of automated systems in instrument conditions."}
  ]$$::jsonb,
  $$[
    {"code":"IR.II.A.S1","description":"Demonstrate familiarity with anti- or de-icing procedures or information published by the manufacturer specific to the aircraft used on the practical test."},
    {"code":"IR.II.A.S2","description":"Demonstrate familiarity with the automatic flight control system (AFCS) procedures or information published by the manufacturer specific to the aircraft used on the practical test, if applicable."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.II.B', 'instrument', 'Preflight Procedures', 'Aircraft Flight Instruments and Navigation Equipment',
  $$[
    {"code":"IR.II.B.K1","description":"Operation of the aircraft''s applicable flight instrument system(s), including: pitot-static instrument system and associated instruments, gyroscopic/electric/vacuum instrument system and associated instruments, electrical systems, electronic flight instrument displays [primary flight display (PFD), multi-function display (MFD)], transponder and automatic dependent surveillance - broadcast (ADS-B), magnetic compass"},
    {"code":"IR.II.B.K2","description":"Operation of the aircraft''s applicable navigation system(s), including: Very high frequency (VHF) Omnidirectional Range (VOR), distance measuring equipment (DME), instrument landing system (ILS), marker beacon receiver/indicators, area navigation (RNAV), global positioning system (GPS), Wide Area Augmentation System (WAAS), flight management system (FMS), autopilot"},
    {"code":"IR.II.B.K3","description":"Use of an electronic flight bag (EFB), if used."}
  ]$$::jsonb,
  $$[
    {"code":"IR.II.B.R1","description":"Monitoring and management of automated systems."},
    {"code":"IR.II.B.R2","description":"Difference between approved and non-approved navigation devices."},
    {"code":"IR.II.B.R3","description":"Modes of flight and navigation instruments, including failure conditions."},
    {"code":"IR.II.B.R4","description":"Use of an electronic flight bag."},
    {"code":"IR.II.B.R5","description":"Use of navigation databases."}
  ]$$::jsonb,
  $$[
    {"code":"IR.II.B.S1","description":"Operate and manage installed instruments and navigation equipment."},
    {"code":"IR.II.B.S2","description":"Operate and manage an applicant supplied electronic flight bag (EFB), if used."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.II.C', 'instrument', 'Preflight Procedures', 'Instrument Flight Deck Check',
  $$[
    {"code":"IR.II.C.K1","description":"Purpose of performing an instrument flight deck check and how to detect possible defects."},
    {"code":"IR.II.C.K2","description":"IFR airworthiness, including aircraft inspection requirements and required equipment for IFR flight."},
    {"code":"IR.II.C.K3","description":"Required procedures, documentation, and limitations of flying with inoperative equipment."}
  ]$$::jsonb,
  $$[
    {"code":"IR.II.C.R1","description":"Operating with inoperative equipment."},
    {"code":"IR.II.C.R2","description":"Operating with outdated navigation publications or databases."}
  ]$$::jsonb,
  $$[
    {"code":"IR.II.C.S1","description":"Perform preflight inspection by following the checklist appropriate to the aircraft and determine if the aircraft is in a condition for safe instrument flight."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ============================================================
-- AREA III: Air Traffic Control (ATC) Clearances and Procedures (2 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.III.A', 'instrument', 'Air Traffic Control (ATC) Clearances and Procedures', 'Compliance with Air Traffic Control Clearances',
  $$[
    {"code":"IR.III.A.K1","description":"Elements and procedures related to ATC clearances and pilot/controller responsibilities for departure, en route, and arrival phases of flight, including clearance void times."},
    {"code":"IR.III.A.K2","description":"Pilot-in-Command (PIC) emergency authority."},
    {"code":"IR.III.A.K3","description":"Lost communication procedures and procedures for flights outside of radar environments."}
  ]$$::jsonb,
  $$[
    {"code":"IR.III.A.R1","description":"Less than full understanding of an ATC clearance."},
    {"code":"IR.III.A.R2","description":"Inappropriate, incomplete, or incorrect ATC clearances."},
    {"code":"IR.III.A.R3","description":"ATC clearance inconsistent with aircraft performance or navigation capability."},
    {"code":"IR.III.A.R4","description":"ATC clearance intended for other aircraft with similar call signs."}
  ]$$::jsonb,
  $$[
    {"code":"IR.III.A.S1","description":"Correctly copy, read back, interpret, and comply with simulated or actual ATC clearances in a timely manner using standard phraseology as provided in the Aeronautical Information Manual (AIM)."},
    {"code":"IR.III.A.S2","description":"Correctly set communication frequencies, navigation systems (identifying when appropriate), and transponder codes in compliance with the ATC clearance."},
    {"code":"IR.III.A.S3","description":"Use the current and appropriate paper or electronic navigation publications."},
    {"code":"IR.III.A.S4","description":"Intercept all courses, radials, and bearings appropriate to the procedure, route, or clearance in a timely manner."},
    {"code":"IR.III.A.S5","description":"Maintain the applicable airspeed +/-10 knots, headings +/-10 degrees, altitude +/-100 feet; track a course, radial, or bearing within 3/4-scale deflection of the course deviation indicator (CDI)."},
    {"code":"IR.III.A.S6","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."},
    {"code":"IR.III.A.S7","description":"Perform the appropriate checklist items relative to the phase of flight."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.III.B', 'instrument', 'Air Traffic Control (ATC) Clearances and Procedures', 'Holding Procedures',
  $$[
    {"code":"IR.III.B.K1","description":"Elements related to holding procedures, including reporting criteria, appropriate speeds, and recommended entry procedures for standard, nonstandard, published, and non-published holding patterns."}
  ]$$::jsonb,
  $$[
    {"code":"IR.III.B.R1","description":"Recalculating fuel reserves if assigned an unanticipated expect further clearance (EFC) time."},
    {"code":"IR.III.B.R2","description":"Scenarios and circumstances that could result in minimum fuel or the need to declare an emergency."},
    {"code":"IR.III.B.R3","description":"Scenarios that could lead to holding, including deteriorating weather at the planned destination."},
    {"code":"IR.III.B.R4","description":"Holding entry and wind correction while holding."}
  ]$$::jsonb,
  $$[
    {"code":"IR.III.B.S1","description":"Use an entry procedure appropriate for a standard, nonstandard, published, or non-published holding pattern."},
    {"code":"IR.III.B.S2","description":"Change to the holding airspeed appropriate for the altitude when 3 minutes or less from, but prior to arriving at, the holding fix and set appropriate power as needed for fuel conservation."},
    {"code":"IR.III.B.S3","description":"Recognize arrival at the holding fix and promptly initiate entry into the holding pattern. Comply with the holding pattern leg length and other restrictions, if applicable, associated with the holding pattern."},
    {"code":"IR.III.B.S4","description":"Maintain airspeed +/-10 knots, altitude +/-100 feet, selected headings within +/-10 degrees, and track a selected course, radial, or bearing within 3/4-scale deflection of the course deviation indicator (CDI)."},
    {"code":"IR.III.B.S5","description":"Use proper wind correction procedures to maintain the desired pattern and to arrive over the fix as close as possible to a specified time."},
    {"code":"IR.III.B.S6","description":"Use a multi-function display (MFD) and other graphical navigation displays, if installed, to monitor position in relation to the desired flightpath during holding."},
    {"code":"IR.III.B.S7","description":"Comply with ATC reporting requirements and restrictions associated with the holding pattern."},
    {"code":"IR.III.B.S8","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ============================================================
-- AREA IV: Flight by Reference to Instruments (2 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.IV.A', 'instrument', 'Flight by Reference to Instruments', 'Instrument Flight',
  $$[
    {"code":"IR.IV.A.K1","description":"Elements related to attitude instrument flying during straight-and-level flight, climbs, turns, and descents while conducting various instrument flight procedures."},
    {"code":"IR.IV.A.K2","description":"Interpretation, operation, and limitations of pitch, bank, and power instruments."},
    {"code":"IR.IV.A.K3","description":"Normal and abnormal instrument indications and operations."}
  ]$$::jsonb,
  $$[
    {"code":"IR.IV.A.R1","description":"Situations that can affect physiology and degrade instrument cross-check."},
    {"code":"IR.IV.A.R2","description":"Spatial disorientation and optical illusions."},
    {"code":"IR.IV.A.R3","description":"Flying unfamiliar aircraft or operating with unfamiliar flight display systems and avionics."}
  ]$$::jsonb,
  $$[
    {"code":"IR.IV.A.S1","description":"Maintain altitude +/-100 feet during level flight, selected headings +/-10 degrees, airspeed +/-10 knots, and bank angles +/-5 degrees during turns."},
    {"code":"IR.IV.A.S2","description":"Use proper instrument cross-check and interpretation, and apply the appropriate pitch, bank, power, and trim corrections when applicable."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.IV.B', 'instrument', 'Flight by Reference to Instruments', 'Recovery from Unusual Flight Attitudes',
  $$[
    {"code":"IR.IV.B.K1","description":"Procedures for recovery from unusual attitudes in flight."},
    {"code":"IR.IV.B.K2","description":"Prevention of unusual attitudes, including flight causal, physiological, and environmental factors, and system and equipment failures."},
    {"code":"IR.IV.B.K3","description":"Procedures available to safely regain visual meteorological conditions (VMC) after flight into inadvertent instrument meteorological conditions or unintended instrument meteorological conditions (IIMC)/(UIMC)."},
    {"code":"IR.IV.B.K4","description":"Appropriate use of automation, if applicable."}
  ]$$::jsonb,
  $$[
    {"code":"IR.IV.B.R1","description":"Situations that could lead to loss of control in-flight (LOC-I) or unusual attitudes in-flight (e.g., stress, task saturation, inadequate instrument scan distractions, and spatial disorientation)."},
    {"code":"IR.IV.B.R3","description":"Operating envelope considerations."},
    {"code":"IR.IV.B.R4","description":"Interpreting flight instruments."},
    {"code":"IR.IV.B.R5","description":"Assessment of the unusual attitude."},
    {"code":"IR.IV.B.R6","description":"Control input errors, inducing undesired aircraft attitudes."},
    {"code":"IR.IV.B.R7","description":"Control application solely by reference to instruments."},
    {"code":"IR.IV.B.R8","description":"Collision hazards."},
    {"code":"IR.IV.B.R9","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"IR.IV.B.S1","description":"Use proper instrument cross-check and interpretation to identify an unusual attitude (including both nose-high and nose-low) in flight, and apply the appropriate flight control, power input, and aircraft configuration in the correct sequence, to return to a stabilized level flight attitude."},
    {"code":"IR.IV.B.S2","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ============================================================
-- AREA V: Navigation Systems (2 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.V.A', 'instrument', 'Navigation Systems', 'Intercepting and Tracking Navigational Systems and DME Arcs',
  $$[
    {"code":"IR.V.A.K1","description":"Ground-based navigation (orientation, course determination, equipment, tests, and regulations), including procedures for intercepting and tracking courses and arcs."},
    {"code":"IR.V.A.K2","description":"Satellite-based navigation (orientation, course determination, equipment, tests, regulations, interference, appropriate use of databases, Receiver Autonomous Integrity Monitoring (RAIM), and Wide Area Augmentation System (WAAS)), including procedures for intercepting and tracking courses and arcs."}
  ]$$::jsonb,
  $$[
    {"code":"IR.V.A.R1","description":"Management of automated navigation and autoflight systems."},
    {"code":"IR.V.A.R2","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"IR.V.A.R3","description":"Limitations of the navigation system in use."}
  ]$$::jsonb,
  $$[
    {"code":"IR.V.A.S1","description":"Tune and identify the navigation facility/program the navigation system and verify system accuracy as appropriate for the equipment installed in the aircraft."},
    {"code":"IR.V.A.S2","description":"Determine aircraft position relative to the navigational facility or waypoint."},
    {"code":"IR.V.A.S3","description":"Set and orient to the course to be intercepted."},
    {"code":"IR.V.A.S4","description":"Intercept the specified course at appropriate angle, inbound to or outbound from a navigational facility or waypoint."},
    {"code":"IR.V.A.S5","description":"Maintain airspeed +/-10 knots, altitude +/-100 feet, and selected headings +/-5 degrees."},
    {"code":"IR.V.A.S6","description":"Apply proper correction to maintain a course, allowing no more than 3/4-scale deflection of the course deviation indicator (CDI). If a distance measuring equipment (DME) arc is selected, maintain that arc +/-1 nautical mile."},
    {"code":"IR.V.A.S7","description":"Recognize navigational system or facility failure, and when required, report the failure to air traffic control (ATC)."},
    {"code":"IR.V.A.S8","description":"Use a multi-function display (MFD) and other graphical navigation displays, if installed, to monitor position, track wind drift, and to maintain situational awareness."},
    {"code":"IR.V.A.S9","description":"At the discretion of the evaluator, use the autopilot to make appropriate course intercepts, if installed."},
    {"code":"IR.V.A.S10","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.V.B', 'instrument', 'Navigation Systems', 'Departure, En Route, and Arrival Operations',
  $$[
    {"code":"IR.V.B.K1","description":"Elements related to ATC routes, including departure procedures (DPs) and associated climb gradients; standard terminal arrival (STAR) procedures and associated constraints."},
    {"code":"IR.V.B.K2","description":"Pilot/controller responsibilities, communication procedures, and ATC services available to pilots."}
  ]$$::jsonb,
  $$[
    {"code":"IR.V.B.R1","description":"ATC communications and compliance with published procedures."},
    {"code":"IR.V.B.R2","description":"Limitations of traffic avoidance equipment."},
    {"code":"IR.V.B.R3","description":"Responsibility to use \"see and avoid\" techniques when possible."}
  ]$$::jsonb,
  $$[
    {"code":"IR.V.B.S1","description":"Select, identify (as necessary) and use the appropriate communication and navigation facilities associated with the proposed flight."},
    {"code":"IR.V.B.S2","description":"Perform the appropriate checklist items relative to the phase of flight."},
    {"code":"IR.V.B.S3","description":"Use the current and appropriate paper or electronic navigation publications."},
    {"code":"IR.V.B.S4","description":"Establish two-way communications with the proper controlling agency, use proper phraseology, and comply in a timely manner with all ATC instructions and airspace restrictions."},
    {"code":"IR.V.B.S5","description":"Intercept all courses, radials, and bearings appropriate to the procedure, route, or clearance in a timely manner."},
    {"code":"IR.V.B.S6","description":"Comply with all applicable charted procedures."},
    {"code":"IR.V.B.S7","description":"Maintain airspeed +/-10 knots, altitude +/-100 feet, and selected headings +/-10 degrees, and apply proper correction to maintain a course allowing no more than 3/4-scale deflection of the course deviation indicator (CDI)."},
    {"code":"IR.V.B.S8","description":"Update/interpret weather in flight."},
    {"code":"IR.V.B.S9","description":"Use displays of digital weather and aeronautical information, as applicable to maintain situational awareness."},
    {"code":"IR.V.B.S10","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ============================================================
-- AREA VI: Instrument Approach Procedures (5 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.VI.A', 'instrument', 'Instrument Approach Procedures', 'Non-precision Approach',
  $$[
    {"code":"IR.VI.A.K1","description":"Procedures and limitations associated with a non-precision approach, including the differences between Localizer Performance (LP) and Lateral Navigation (LNAV) approach guidance."},
    {"code":"IR.VI.A.K2","description":"Navigation system indications and annunciations expected during an area navigation (RNAV) approach."},
    {"code":"IR.VI.A.K3","description":"Ground-based and satellite-based navigation systems used for a non-precision approach."},
    {"code":"IR.VI.A.K4","description":"A stabilized approach, including energy management concepts."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VI.A.R1","description":"Deviating from the assigned approach procedure."},
    {"code":"IR.VI.A.R2","description":"Selecting a navigation frequency."},
    {"code":"IR.VI.A.R3","description":"Management of automated navigation and autoflight systems."},
    {"code":"IR.VI.A.R4","description":"Aircraft configuration during an approach and missed approach."},
    {"code":"IR.VI.A.R5","description":"An unstable approach, including excessive descent rates."},
    {"code":"IR.VI.A.R6","description":"Deteriorating weather conditions on approach."},
    {"code":"IR.VI.A.R7","description":"Operating below the minimum descent altitude (MDA) without proper visual references."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VI.A.S1","description":"Accomplish the non-precision instrument approaches selected by the evaluator."},
    {"code":"IR.VI.A.S2","description":"Establish two-way communications with air traffic control (ATC) appropriate for the phase of flight or approach segment, and use proper communication phraseology."},
    {"code":"IR.VI.A.S3","description":"Select, tune, identify, and confirm the operational status of navigation equipment to be used for the approach."},
    {"code":"IR.VI.A.S4","description":"Comply with all clearances issued by ATC or the evaluator."},
    {"code":"IR.VI.A.S5","description":"Recognize if any flight instrumentation is inaccurate or inoperative, and take appropriate action."},
    {"code":"IR.VI.A.S6","description":"Advise ATC or the evaluator if unable to comply with a clearance."},
    {"code":"IR.VI.A.S7","description":"Complete the appropriate checklist(s)."},
    {"code":"IR.VI.A.S8","description":"Establish the appropriate aircraft configuration and airspeed considering meteorological and operating conditions."},
    {"code":"IR.VI.A.S9","description":"Maintain altitude +/-100 feet, selected heading +/-10 degrees, airspeed +/-10 knots, no more than 3/4 scale CDI deflection, and accurately track radials, courses, or bearings, prior to beginning the final approach segment."},
    {"code":"IR.VI.A.S10","description":"Adjust the published MDA and visibility criteria for the aircraft approach category, as appropriate, for factors that include Notices of Air Missions (NOTAMs), inoperative aircraft or navigation equipment, or inoperative visual aids associated with the landing environment, etc."},
    {"code":"IR.VI.A.S11","description":"Establish a stabilized descent to the appropriate altitude."},
    {"code":"IR.VI.A.S12","description":"For the final approach segment, maintain no more than 3/4 scale CDI deflection, airspeed +/-10 knots, and altitude, if applicable, above MDA +100/-0 feet to the Visual Descent Point (VDP) or missed approach point (MAP)."},
    {"code":"IR.VI.A.S13","description":"Assess if the required visual references are available, and either initiate the missed approach procedure or continue for landing."},
    {"code":"IR.VI.A.S14","description":"Use a multi-function display (MFD) and other graphical navigation displays, if installed, to monitor position, track wind drift, and to maintain situational awareness."},
    {"code":"IR.VI.A.S15","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.VI.B', 'instrument', 'Instrument Approach Procedures', 'Precision Approach',
  $$[
    {"code":"IR.VI.B.K1","description":"Procedures and limitations associated with a precision approach, including determining required descent rates and adjusting minimums in the case of inoperative equipment."},
    {"code":"IR.VI.B.K2","description":"Navigation system displays, annunciations, and modes of operation."},
    {"code":"IR.VI.B.K3","description":"Ground-based and satellite-based navigation systems (orientation, course determination, equipment, tests and regulations, interference, appropriate use of navigation data, signal integrity)."},
    {"code":"IR.VI.B.K4","description":"A stabilized approach, including energy management concepts."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VI.B.R1","description":"Deviating from the assigned approach procedure."},
    {"code":"IR.VI.B.R2","description":"Selecting a navigation frequency."},
    {"code":"IR.VI.B.R3","description":"Management of automated navigation and autoflight systems."},
    {"code":"IR.VI.B.R4","description":"Aircraft configuration during an approach and missed approach."},
    {"code":"IR.VI.B.R5","description":"An unstable approach, including excessive descent rates."},
    {"code":"IR.VI.B.R6","description":"Deteriorating weather conditions on approach."},
    {"code":"IR.VI.B.R7","description":"Continuing to descend below the Decision Altitude (DA)/Decision Height (DH) when the required visual references are not visible."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VI.B.S1","description":"Accomplish the precision instrument approach(es) selected by the evaluator."},
    {"code":"IR.VI.B.S2","description":"Establish two-way communications with air traffic control (ATC) appropriate for the phase of flight or approach segment, and use proper communication phraseology."},
    {"code":"IR.VI.B.S3","description":"Select, tune, identify, and confirm the operational status of navigation equipment to be used for the approach."},
    {"code":"IR.VI.B.S4","description":"Comply with all clearances issued by ATC or the evaluator."},
    {"code":"IR.VI.B.S5","description":"Recognize if any flight instrumentation is inaccurate or inoperative, and take appropriate action."},
    {"code":"IR.VI.B.S6","description":"Advise ATC or the evaluator if unable to comply with a clearance."},
    {"code":"IR.VI.B.S7","description":"Complete the appropriate checklist(s)."},
    {"code":"IR.VI.B.S8","description":"Establish the appropriate aircraft configuration and airspeed considering meteorological and operating conditions."},
    {"code":"IR.VI.B.S9","description":"Maintain altitude +/-100 feet, selected heading +/-10 degrees, airspeed +/-10 knots, no more than 3/4 scale CDI deflection, and accurately track radials, courses, or bearings, prior to beginning the final approach segment."},
    {"code":"IR.VI.B.S10","description":"Adjust the published DA/DH and visibility criteria for the aircraft approach category, as appropriate, to account for NOTAMS, inoperative aircraft or navigation equipment, or inoperative visual aids associated with the landing environment."},
    {"code":"IR.VI.B.S11","description":"Establish a predetermined rate of descent at the point where vertical guidance begins, which approximates that required for the aircraft to follow the vertical guidance."},
    {"code":"IR.VI.B.S12","description":"Maintain a stabilized final approach from the final approach fix (FAF) to DA/DH allowing no more than 3/4-scale deflection of either the vertical or lateral guidance indications, and maintain the desired airspeed +/-10 knots."},
    {"code":"IR.VI.B.S13","description":"Immediately initiate the missed approach procedure when at the DA/DH, and the required visual references for the runway are not unmistakably visible and identifiable."},
    {"code":"IR.VI.B.S14","description":"Transition to a normal landing approach (missed approach for seaplanes) only when the airplane is in a position from which a descent to a landing on the runway can be made at a normal rate of descent using normal maneuvering."},
    {"code":"IR.VI.B.S15","description":"Maintain a stabilized visual flight path from the DA/DH to the runway aiming point where a normal landing may be accomplished within the touchdown zone."},
    {"code":"IR.VI.B.S16","description":"Use a multi-function display (MFD) and other graphical navigation displays, if installed, to monitor position, track wind drift, and to maintain situational awareness."},
    {"code":"IR.VI.B.S17","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.VI.C', 'instrument', 'Instrument Approach Procedures', 'Missed Approach',
  $$[
    {"code":"IR.VI.C.K1","description":"Elements related to missed approach procedures and limitations associated with standard instrument approaches, including while using a flight management system (FMS) or autopilot, if equipped."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VI.C.R1","description":"Deviations from prescribed procedures or ATC instructions."},
    {"code":"IR.VI.C.R2","description":"Holding, diverting, or electing to fly the approach again."},
    {"code":"IR.VI.C.R3","description":"Aircraft configuration during an approach and missed approach."},
    {"code":"IR.VI.C.R4","description":"Factors that might lead to executing a missed approach procedure before the MAP or to a go-around below DA, DH, or MDA, as applicable."},
    {"code":"IR.VI.C.R5","description":"Management of automated navigation and autoflight systems."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VI.C.S1","description":"Promptly initiate the missed approach procedure and report it to ATC."},
    {"code":"IR.VI.C.S2","description":"Apply the appropriate power setting for the flight condition and establish a pitch attitude necessary to obtain the desired performance."},
    {"code":"IR.VI.C.S3","description":"Configure the airplane in accordance with airplane manufacturer''s instructions, establish a positive rate of climb, and accelerate to the appropriate airspeed, +/-10 knots."},
    {"code":"IR.VI.C.S4","description":"Follow the recommended checklist items appropriate to the missed approach/go-around procedure."},
    {"code":"IR.VI.C.S5","description":"Comply with the published or alternate missed approach procedure."},
    {"code":"IR.VI.C.S6","description":"Advise ATC or the evaluator if unable to comply with a clearance, restriction, or climb gradient."},
    {"code":"IR.VI.C.S7","description":"Maintain the recommended airspeed +/-10 knots; heading, course, or bearing +/-10 degrees; and altitude(s) +/-100 feet during the missed approach procedure."},
    {"code":"IR.VI.C.S8","description":"Use an MFD and other graphical navigation displays, if installed, to monitor position and track to help navigate the missed approach."},
    {"code":"IR.VI.C.S9","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."},
    {"code":"IR.VI.C.S10","description":"Request ATC clearance to attempt another approach, proceed to the alternate airport, holding fix, or other clearance limit, as appropriate, or as directed by the evaluator."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.VI.D', 'instrument', 'Instrument Approach Procedures', 'Circling Approach',
  $$[
    {"code":"IR.VI.D.K1","description":"Elements related to circling approach procedures and limitations, including approach categories and related airspeed restrictions."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VI.D.R1","description":"Prescribed circling approach procedures."},
    {"code":"IR.VI.D.R2","description":"Executing a circling approach at night or with marginal visibility."},
    {"code":"IR.VI.D.R3","description":"Losing visual contact with an identifiable part of the airport."},
    {"code":"IR.VI.D.R4","description":"Management of automated navigation and autoflight systems."},
    {"code":"IR.VI.D.R5","description":"Management of altitude, airspeed, or distance while circling."},
    {"code":"IR.VI.D.R6","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"IR.VI.D.R7","description":"Executing a missed approach after the MAP while circling."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VI.D.S1","description":"Comply with the circling approach procedure considering turbulence, windshear, and the maneuvering capability and approach category of the aircraft."},
    {"code":"IR.VI.D.S2","description":"Confirm the direction of traffic and adhere to all restrictions and instructions issued by ATC or the evaluator."},
    {"code":"IR.VI.D.S3","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."},
    {"code":"IR.VI.D.S4","description":"Establish the approach and landing configuration. Maintain a stabilized approach and a descent rate that ensures arrival at the MDA, or the preselected circling altitude above the MDA, prior to the missed approach point."},
    {"code":"IR.VI.D.S5","description":"Maintain airspeed +/-10 knots, desired heading/track +/-10 degrees, and altitude +100/-0 feet until descending below the MDA or the preselected circling altitude above the MDA."},
    {"code":"IR.VI.D.S6","description":"Visually maneuver to a base or downwind leg appropriate for the landing runway and environmental conditions."},
    {"code":"IR.VI.D.S7","description":"If a missed approach occurs, turn in the appropriate direction using the correct procedure and appropriately configure the airplane."},
    {"code":"IR.VI.D.S8","description":"If landing, initiate a stabilized descent. Touch down on the first one-third of the selected runway without excessive maneuvering, without exceeding the normal operating limits of the airplane, and without exceeding 30 degrees of bank."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.VI.E', 'instrument', 'Instrument Approach Procedures', 'Landing from an Instrument Approach',
  $$[
    {"code":"IR.VI.E.K1","description":"Elements related to the pilot''s responsibilities, and the environmental, operational, and meteorological factors that affect landing from a straight-in or circling approach."},
    {"code":"IR.VI.E.K2","description":"Airport signs, markings, and lighting, including approach lighting systems."},
    {"code":"IR.VI.E.K3","description":"Appropriate landing profiles and aircraft configurations."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VI.E.R1","description":"Attempting to land from an unstable approach."},
    {"code":"IR.VI.E.R2","description":"Flying below the glidepath."},
    {"code":"IR.VI.E.R3","description":"Transitioning from instrument to visual references for landing."},
    {"code":"IR.VI.E.R4","description":"Aircraft configuration for landing."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VI.E.S1","description":"Transition at the DA/DH, MDA, or visual descent point (VDP) to a visual flight condition, allowing for safe visual maneuvering and a normal landing."},
    {"code":"IR.VI.E.S2","description":"Adhere to all ATC or evaluator advisories, such as NOTAMs, windshear, wake turbulence, runway surface, and other operational considerations."},
    {"code":"IR.VI.E.S3","description":"Complete the appropriate checklist(s)."},
    {"code":"IR.VI.E.S4","description":"Maintain positive airplane control throughout the landing maneuver."},
    {"code":"IR.VI.E.S5","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ============================================================
-- AREA VII: Emergency Operations (4 tasks)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.VII.A', 'instrument', 'Emergency Operations', 'Loss of Communications',
  $$[
    {"code":"IR.VII.A.K1","description":"Procedures to follow in the event of lost communication during various phases of flight, including techniques for reestablishing communications, when it is acceptable to deviate from an instrument flight rules (IFR) clearance, and when to begin an approach at the destination."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VII.A.R1","description":"Possible reasons for loss of communication."},
    {"code":"IR.VII.A.R2","description":"Deviation from procedures for lost communications."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VII.A.S1","description":"Recognize a simulated loss of communication."},
    {"code":"IR.VII.A.S2","description":"Simulate actions to re-establish communication."},
    {"code":"IR.VII.A.S3","description":"Determine whether to continue to flight plan destination or deviate."},
    {"code":"IR.VII.A.S4","description":"Determine appropriate time to begin an approach."},
    {"code":"IR.VII.A.S5","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.VII.B', 'instrument', 'Emergency Operations', 'One Engine Inoperative (Simulated) during Straight-and-Level Flight and Turns',
  $$[
    {"code":"IR.VII.B.K1","description":"Procedures used if engine failure occurs during straight-and-level flight and turns while on instruments."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VII.B.R1","description":"Identification of the inoperative engine."},
    {"code":"IR.VII.B.R2","description":"Inability to climb or maintain altitude with an inoperative engine."},
    {"code":"IR.VII.B.R3","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"IR.VII.B.R4","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"IR.VII.B.R5","description":"Fuel management during single-engine operation."},
    {"code":"IR.VII.B.R6","description":"Configuring the aircraft."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VII.B.S1","description":"Promptly recognize an engine failure and maintain positive aircraft control."},
    {"code":"IR.VII.B.S2","description":"Set the engine controls, reduce drag, identify and verify the inoperative engine, and simulate feathering of the propeller on the inoperative engine (evaluator should then establish zero thrust on the inoperative engine)."},
    {"code":"IR.VII.B.S3","description":"Establish the best engine-inoperative airspeed and trim the airplane."},
    {"code":"IR.VII.B.S4","description":"Use flight controls in the proper combination as recommended by the manufacturer, or as required to maintain best performance, and trim as required."},
    {"code":"IR.VII.B.S5","description":"Verify the prescribed checklist procedures used for securing the inoperative engine."},
    {"code":"IR.VII.B.S6","description":"Attempt to determine and resolve the reason for the engine failure."},
    {"code":"IR.VII.B.S7","description":"Monitor engine functions and make necessary adjustments."},
    {"code":"IR.VII.B.S8","description":"Maintain the specified altitude +/-100 feet or minimum sink rate if applicable, airspeed +/-10 knots, and the specified heading +/-10 degrees."},
    {"code":"IR.VII.B.S9","description":"Assess the aircraft''s performance capability and decide an appropriate action to ensure a safe landing."},
    {"code":"IR.VII.B.S10","description":"Maintain control and fly within the aircraft''s operating limitations."},
    {"code":"IR.VII.B.S11","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{AMEL,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.VII.C', 'instrument', 'Emergency Operations', 'Instrument Approach and Landing with an Inoperative Engine (Simulated)',
  $$[
    {"code":"IR.VII.C.K1","description":"Instrument approach procedures with one engine inoperative."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VII.C.R1","description":"Potential engine failure during approach and landing."},
    {"code":"IR.VII.C.R3","description":"Configuring the airplane."},
    {"code":"IR.VII.C.R4","description":"Low altitude maneuvering, including stall, spin, or controlled flight into terrain (CFIT)."},
    {"code":"IR.VII.C.R5","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."},
    {"code":"IR.VII.C.R6","description":"Performing a go-around/rejected landing with an engine failure."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VII.C.S1","description":"Promptly recognize an engine failure and maintain positive aircraft control."},
    {"code":"IR.VII.C.S2","description":"Set the engine controls, reduce drag, identify and verify the inoperative engine, and simulate feathering of the propeller on the inoperative engine (evaluator should then establish zero thrust on the inoperative engine)."},
    {"code":"IR.VII.C.S3","description":"Use flight controls in the proper combination as recommended by the manufacturer, or as required to maintain best performance, and trim as required."},
    {"code":"IR.VII.C.S4","description":"Follow the manufacturer''s recommended emergency procedures and complete the appropriate checklist."},
    {"code":"IR.VII.C.S5","description":"Monitor the operating engine and aircraft systems and make adjustments as necessary."},
    {"code":"IR.VII.C.S6","description":"Request and follow an actual or a simulated air traffic control (ATC) clearance for an instrument approach."},
    {"code":"IR.VII.C.S7","description":"Maintain altitude +/-100 feet or minimum sink rate if applicable, airspeed +/-10 knots, and selected heading +/-10 degrees."},
    {"code":"IR.VII.C.S8","description":"Establish a rate of descent that ensures arrival at the minimum descent altitude (MDA) or decision altitude (DA)/decision height (DH) with the airplane in a position from which a descent to a landing on the intended runway can be made, either straight in or circling as appropriate."},
    {"code":"IR.VII.C.S9","description":"On final approach segment, maintain vertical (as applicable) and lateral guidance within 3/4-scale deflection."},
    {"code":"IR.VII.C.S10","description":"Maintain control and fly within the aircraft''s operating limitations."},
    {"code":"IR.VII.C.S11","description":"Comply with the published criteria for the aircraft approach category if circling."},
    {"code":"IR.VII.C.S12","description":"Execute a landing."},
    {"code":"IR.VII.C.S13","description":"Complete the appropriate checklist(s)."},
    {"code":"IR.VII.C.S14","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{AMEL,AMES}'
);

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.VII.D', 'instrument', 'Emergency Operations', 'Approach with Loss of Primary Flight Instrument Indicators',
  $$[
    {"code":"IR.VII.D.K1","description":"Recognizing if primary flight instruments are inaccurate or inoperative, and advising ATC or the evaluator."},
    {"code":"IR.VII.D.K2","description":"Possible failure modes of primary instruments and how to correct or minimize the effect of the loss."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VII.D.R1","description":"Use of secondary flight displays when primary displays have failed."},
    {"code":"IR.VII.D.R2","description":"Maintaining aircraft control."},
    {"code":"IR.VII.D.R3","description":"Distractions, task prioritization, loss of situational awareness, or disorientation."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VII.D.S1","description":"Advise ATC or the evaluator if unable to comply with a clearance."},
    {"code":"IR.VII.D.S2","description":"Complete a non-precision instrument approach without the use of the primary flight instruments using the skill elements of the non-precision approach Task (see Area of Operation VI, Task A)."},
    {"code":"IR.VII.D.S3","description":"Use single-pilot resource management (SRM) or crew resource management (CRM), as appropriate."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ============================================================
-- AREA VIII: Postflight Procedures (1 task)
-- ============================================================

INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes) VALUES
(
  'IR.VIII.A', 'instrument', 'Postflight Procedures', 'Checking Instruments and Equipment',
  $$[
    {"code":"IR.VIII.A.K1","description":"Procedures for documenting in-flight/postflight discrepancies."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VIII.A.R1","description":"Performance and documentation of postflight inspection and aircraft discrepancies."}
  ]$$::jsonb,
  $$[
    {"code":"IR.VIII.A.S1","description":"Conduct a postflight inspection and document discrepancies and servicing requirements, if any."}
  ]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

COMMIT;
