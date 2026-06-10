/**
 * Fallback scenario library (W5.4, design §4).
 *
 * Used when spine generation fails validation twice — the engine degrades to
 * "good" rather than failing exam start. Three complete, aviation-plausible
 * scenarios per rating, grounded in each rating's typical aircraft and
 * mission profile. Hooks reference common always-planned elements; the
 * server drops any hook whose element is not in the session's plan.
 */
import type { ScenarioSpine } from './scenario-engine';

export const SCENARIO_TEMPLATES: Record<'private' | 'commercial' | 'instrument', ScenarioSpine[]> = {
  private: [
    {
      scenario: {
        aircraft: 'Cessna 172S, N735KT, steam gauges with a Garmin GNS 430W',
        mission: 'Day VFR cross-country KCRG (Jacksonville Craig) → KOCF (Ocala) with a non-pilot friend',
        conditions: 'July afternoon in Florida — scattered cumulus building west of the route, density altitude notable, sea-breeze front possible by mid-afternoon',
        pilot: 'You, a private pilot applicant on your checkride day',
        constraints: ['your friend is prone to airsickness', 'you both need to be back by 6 pm for a family dinner'],
      },
      hooks: [
        { element_code: 'PA.I.A.K1', hook: 'whether you may legally carry your friend today and what recent experience that requires' },
        { element_code: 'PA.I.B.K1', hook: 'the squawk list the club posted for N735KT this morning' },
        { element_code: 'PA.I.C.K1', hook: 'the building cumulus west of your route' },
        { element_code: 'PA.I.F.K1', hook: 'the hot July density altitude at departure' },
        { element_code: 'PA.II.A.K1', hook: 'your friend asking what all the preflight walking-around is for' },
      ],
      events: [
        { trigger: 'after_area:VI', event: 'Approaching Ocala, the alternator light flickers and the ammeter shows discharge.' },
      ],
    },
    {
      scenario: {
        aircraft: 'Piper Archer III, N4321D, dual G5s with a GTN 650',
        mission: 'Day VFR flight KSGJ (St. Augustine) → KGNV (Gainesville) to visit a college friend, returning the same evening',
        conditions: 'Late October morning — coastal stratus burning off, AIRMET Sierra for IFR conditions inland until 1500Z, light easterly flow',
        pilot: 'You, a private pilot applicant on your checkride day',
        constraints: ['the return leg will be near sunset', 'your friend wants a quick sightseeing lap over the stadium'],
      },
      hooks: [
        { element_code: 'PA.I.C.K1', hook: 'the AIRMET Sierra and when the stratus will actually lift' },
        { element_code: 'PA.I.E.K1', hook: 'the Gainesville Class D and the stadium TFR question your friend raised' },
        { element_code: 'PA.XI.A.K1', hook: 'the near-sunset return and night currency' },
        { element_code: 'PA.I.A.K2', hook: 'whether you may share costs with your friend for this flight' },
        { element_code: 'PA.IX.A.K1', hook: 'what you would do if the engine quit over the pine forest stretch' },
      ],
      events: [
        { trigger: 'after_exchange:10', event: 'On the return leg the GTN 650 screen goes dark.' },
      ],
    },
    {
      scenario: {
        aircraft: 'Cessna 182T, N9152B, analog gauges, recently out of annual',
        mission: 'Day VFR mountain-adjacent flight KAPA (Centennial, Denver) → KCOS (Colorado Springs) for a lunch meeting',
        conditions: 'June late morning — clear, hot, light winds at the surface but a PIREP for moderate turbulence over the ridgeline, density altitude at APA already 8,500 ft',
        pilot: 'You, a private pilot applicant on your checkride day',
        constraints: ['the 182 is loaded near max gross with two passengers and bags', 'your lunch contact can only meet between 12:00 and 13:30'],
      },
      hooks: [
        { element_code: 'PA.I.F.K1', hook: 'the 8,500 ft density altitude with a near-gross airplane' },
        { element_code: 'PA.I.F.K2', hook: 'the takeoff distance numbers your passengers asked about' },
        { element_code: 'PA.I.D.K1', hook: 'whether you can even fit both passengers, bags, and full fuel' },
        { element_code: 'PA.I.C.K3', hook: 'the turbulence PIREP over the ridge' },
        { element_code: 'PA.III.B.K1', hook: 'the Class C at Colorado Springs' },
      ],
      events: [
        { trigger: 'after_area:I', event: 'Your front-seat passenger mentions feeling lightheaded as you discuss the high terrain.' },
      ],
    },
  ],
  commercial: [
    {
      scenario: {
        aircraft: 'Piper Arrow IV, N2842X, complex single with a six-pack and a GNS 430',
        mission: 'Part 91 photo-flight job: fly a photographer from KFXE (Fort Lauderdale Exec) over the Everglades restoration sites, then reposition to KAPF (Naples)',
        conditions: 'February morning — CAVU, but a strong high gives 25 kt gusting crosswinds at Naples by afternoon',
        pilot: 'You, a commercial applicant being paid for the first time',
        constraints: ['the photographer wants doors-ajar low passes at 1,000 AGL', 'the client is paying by the hobbs hour and watching costs'],
      },
      hooks: [
        { element_code: 'CA.I.A.K1', hook: 'what your new commercial certificate actually lets you be paid for on this job' },
        { element_code: 'CA.I.A.K2', hook: 'whether this photo flight needs a 119 certificate or fits an exception' },
        { element_code: 'CA.I.B.K1', hook: 'the 100-hour inspection question since the Arrow is rented for hire' },
        { element_code: 'CA.IX.A.K1', hook: 'the low-altitude pass the photographer keeps pushing for' },
        { element_code: 'CA.I.F.K2', hook: 'gear-extended performance for the slow photo passes' },
      ],
      events: [
        { trigger: 'after_area:I', event: 'During the photo passes the gear-unsafe light illuminates on the downwind check.' },
      ],
    },
    {
      scenario: {
        aircraft: 'Cessna T182T, N66YP, G1000, turbocharged',
        mission: 'Volunteer pilot flight (charitable medical transport) KBJC (Denver Rocky Mountain) → KGJT (Grand Junction) crossing the Rockies',
        conditions: 'September — clear early, isolated mountain thunderstorms forecast after 1400 local, freezing level 14,000 ft, patient appointment at 1300',
        pilot: 'You, a commercial applicant flying a charitable mission',
        constraints: ['the patient is frail and cannot handle turbulence well', 'the organization reimburses fuel only — you must know the compensation rules'],
      },
      hooks: [
        { element_code: 'CA.I.A.K2', hook: 'whether fuel reimbursement on a charity flight jeopardizes your certificate' },
        { element_code: 'CA.I.C.K1', hook: 'the mountain thunderstorm timing against the 1300 appointment' },
        { element_code: 'CA.I.F.K1', hook: 'turbocharged climb performance and the MEAs through the passes' },
        { element_code: 'CA.II.A.K1', hook: 'supplemental oxygen rules crossing at 14,500' },
        { element_code: 'CA.IX.A.K2', hook: 'an engine-out over the high terrain with no landable valley' },
      ],
      events: [
        { trigger: 'after_exchange:12', event: 'Passing the ridge the TIT gauge spikes near redline.' },
      ],
    },
    {
      scenario: {
        aircraft: 'Beechcraft Bonanza A36, N818VB, IO-550, tip tanks, G500 TXi',
        mission: 'Ferry an owner\'s Bonanza KADS (Addison, Dallas) → KMEM (Memphis) for avionics work; the owner rides along',
        conditions: 'March afternoon — a cold front trails across the route, broken cumulus at 4,500, occasional rain showers, improving from the west',
        pilot: 'You, a commercial applicant hired for the ferry flight',
        constraints: ['the owner is a private pilot who keeps suggesting shortcuts', 'the avionics shop closes at 1700 and the owner pushes to make it'],
      },
      hooks: [
        { element_code: 'CA.I.A.K1', hook: 'who is PIC when the aircraft owner is aboard and rated' },
        { element_code: 'CA.I.C.K2', hook: 'the trailing cold front and the shower line on radar' },
        { element_code: 'CA.I.D.K1', hook: 'tip-tank fuel management and CG travel as fuel burns' },
        { element_code: 'CA.II.A.K2', hook: 'the get-there-itis pressure from the owner' },
        { element_code: 'CA.I.B.K2', hook: 'whether the inop autopilot placard grounds the flight' },
      ],
      events: [
        { trigger: 'after_area:II', event: 'The owner suggests scud-running under the shower line to save time.' },
      ],
    },
  ],
  instrument: [
    {
      scenario: {
        aircraft: 'Cessna 172S, N2461F, G1000 with GFC 700, WAAS',
        mission: 'IFR cross-country KSAT (San Antonio) → KIAH (Houston Bush) for a business meeting, filed at 5,000',
        conditions: 'November morning — coastal stratus, KIAH 400 overcast 2SM mist improving slowly, alternate planning required, light icing PIREP at 8,000 well north',
        pilot: 'You, an instrument applicant on your checkride day',
        constraints: ['the meeting is at 10:30 and rescheduling is costly', 'company traffic into IAH means likely holding'],
      },
      hooks: [
        { element_code: 'IR.I.B.K1', hook: 'whether KIAH legally requires an alternate this morning and what qualifies' },
        { element_code: 'IR.I.A.K1', hook: 'your instrument currency after a slow summer of VFR flying' },
        { element_code: 'IR.II.A.K1', hook: 'the expected hold at the arrival fix' },
        { element_code: 'IR.VI.A.K1', hook: 'the ILS you expect versus the RNAV you might get' },
        { element_code: 'IR.III.A.K1', hook: 'the clearance you copied with a void time' },
      ],
      events: [
        { trigger: 'after_area:II', event: 'Approach advises the ILS glideslope is out of service; expect the LOC-only minimums.' },
      ],
    },
    {
      scenario: {
        aircraft: 'Piper Archer II, N8086J, dual G5s, GNC 355 WAAS navigator, no autopilot',
        mission: 'IFR proficiency flight KPDK (Atlanta DeKalb-Peachtree) → KCHA (Chattanooga) and back, single pilot',
        conditions: 'January — solid stratus 2,000–7,000, tops reported at 7,500, surface temps 4°C, freezing level 6,000 ft, terrain rising toward Chattanooga',
        pilot: 'You, an instrument applicant flying single-pilot IFR',
        constraints: ['no autopilot — hand-flying everything in IMC', 'the freezing level sits inside the cloud layer'],
      },
      hooks: [
        { element_code: 'IR.I.C.K1', hook: 'the freezing level inside the stratus layer and your no-ice airplane' },
        { element_code: 'IR.I.B.K2', hook: 'the MEAs over rising terrain versus your filed altitude' },
        { element_code: 'IR.IV.A.K1', hook: 'single-pilot workload with no autopilot in solid IMC' },
        { element_code: 'IR.V.A.K1', hook: 'a vacuum-free panel: what fails and what backs it up' },
        { element_code: 'IR.VII.A.K1', hook: 'loss of comms in IMC between PDK and CHA' },
      ],
      events: [
        { trigger: 'after_exchange:10', event: 'In the climb you pick up a trace of rime on the strut.' },
      ],
    },
    {
      scenario: {
        aircraft: 'Cirrus SR22 G6, N227CD, Perspective+ avionics, FIKI-equipped',
        mission: 'IFR business flight KAPA (Denver Centennial) → KASE (Aspen) with two colleagues, planning the LOC/DME-E approach',
        conditions: 'October afternoon — broken layers over the mountains, KASE forecasting 5,000 broken with mountain obscuration AIRMET, approach NA at night, sunset 1815 local',
        pilot: 'You, an instrument applicant flying a capable TAA into mountainous terrain',
        constraints: ['the Aspen approach has high minimums and steep missed-approach climb gradients', 'your colleagues have dinner reservations and the approach is not authorized at night'],
      },
      hooks: [
        { element_code: 'IR.I.B.K1', hook: 'alternates when Aspen weather is marginal and the approach is NA at night' },
        { element_code: 'IR.VI.A.K2', hook: 'the circling-only approach and its climb-gradient missed' },
        { element_code: 'IR.I.C.K2', hook: 'mountain obscuration and what FIKI actually buys you' },
        { element_code: 'IR.II.B.K1', hook: 'the GPS RAIM/availability check for the mountain RNAV alternatives' },
        { element_code: 'IR.IV.B.K1', hook: 'the sunset deadline pressure from your colleagues' },
      ],
      events: [
        { trigger: 'after_area:VI', event: 'Denver Center reports the KASE AWOS now showing 4,200 broken — right at minimums for the approach.' },
      ],
    },
  ],
};
