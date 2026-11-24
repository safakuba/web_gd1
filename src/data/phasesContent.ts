export const PROJECT_ANNOTATION = {
  title: 'O projektu',
  paragraphs: [
    'Projekt 12 fází času je osobní interaktivní vizuální studií, která zkoumá, jak subjektivně vnímám plynutí času v různých životních situacích a rozpoloženích. Na zadání dvanácti framů jsem se rozhodl reagovat prostřednictvím jednoho sjednocujícího prvku – mých vlastních digitálních hodinek Casio. Pro mne totiž nepředstavují pouhý kus kovu ke zjištění času, ale osobní archiv všeho, co každý den prožívám.',
    'V každé z dvanácti animací pracuji s tímto objektem zcela odlišně podle toho, jak danou fázi času vnímám. Čas tu není konstantní veličinou, ale tvárným materiálem – jednou se zdá, jako by se úplně zastavil a zamrzl pod vrstvou ledu, jindy se naopak nekonečně natahuje, deformuje nebo zrychluje. Každá ze dvanácti scén je doplněna stručným autorským komentářem, (v mobilní verzi jen animacemi pro doprovod), který přibližuje, co pro mne konkrétní pocit znamená, spolu s krátkým popisem samotné vizuální metamorfózy hodinek.',
    'Celý projekt je koncipován jako interaktivní webová prezentace, ve které si divák může jednotlivé fáze nejen prohlížet, ale 3D modely si také libovolně natáčet a přibližovat. Po technické stránce jde o propojení autorské 3D tvorby a AI nástrojů. Veškeré modelování, materiály a animace vytvářím sám v programu Blender, zatímco samotné webové prostředí v Reactu a WebGL stavím s využitím nástroje Codex. Gemini mi v celém procesu slouží jako technický kopilot při ladění příkazů, shaderů a optimalizaci kódu pro plynulý chod v prohlížeči.',
  ],
}

export const phasesContent = {
  '01': {
    id: '01', title: 'Nekonečnost',
    description: 'Některé okamžiky subjektivně trvají déle. Mám pocit, jako by se cíl stále vzdaloval a časový úsek ke konci se neustále prodlužoval.',
    animationNote: 'Hodinky se nafukují, zvětšují, čímž symbolizují vzdalující se konec.',
  },
  '02': {
    id: '02', title: 'Komprese',
    description: 'Komprese naopak symbolizuje pocit úzkosti z rychlosti uběhlého času, kdy se velké množství vjemů stlačí do velmi krátkého úseku.',
    animationNote: 'Hodinky se deformují do svého středu, jako by se snažily vměstnat více hmoty do jediného okamžiku.',
  },
  '03': {
    id: '03', title: 'Zrychlení',
    description: 'Zde se potkávají dvě odlišné fáze vnímání – plynulý přechod z intenzivního pracovního tempa do volnočasové aktivity, kdy mi čas začne utíkat rapidně rychleji.',
    animationNote: 'Postupně zrychlující se čas v displeji ukazuje zrychlení a chaos.',
  },
  '04': {
    id: '04', title: 'Statičnost',
    description: 'Výjimečný okamžik dokáže působit, jako by se čas úplně zastavil. Zažívám to například při poslechu oblíbeného interpreta nebo při navštívení naší chaty.',
    animationNote: 'Hodinky postupně zamrzají, až je úplně pohltí kostka ledu.',
  },
  '05': {
    id: '05', title: 'Každodennost',
    description: 'Tuto fázi vnímám jako cykličnost, která se přirozeně propisuje do mého života. Ať už chci nebo ne, provází mě opakující se denní rutina.',
    animationNote: 'Hodinky se otáčejí v nekonečné plynulé smyčce bez začátku a konce.',
  },
  '06': {
    id: '06', title: 'Zapomnění',
    description: 'Během života se nám v hlavě filtruje tolik vzpomínek, že je prakticky nevyhnutelné na některé zcela zapomenout.',
    animationNote: 'Hodinky se rozpadají na jemné částice, které se postupně rozplývají v prostoru.',
  },
  '07': {
    id: '07', title: 'Proměna',
    description: 'Čas zanechává na každém z nás viditelné stopy a postupné změny. Každý prožitý okamžik se tiše zapisuje do struktury i povrchu věcí.',
    animationNote: 'Proměnnost času je zachycena skrze korozi.',
  },
  '08': {
    id: '08', title: 'Přítomnost',
    description: 'Čas je zde ukotven v čistém přítomném okamžiku.',
    animationNote: 'Hodinky ukazují dnešní datum, den a čas.',
  },
  '09': {
    id: '09', title: 'Minulost',
    description: 'Minulost nevnímám jako uzavřenou kapitolu, ale jako sérii otisků, které za sebou zanechává každý pohyb v čase.',
    animationNote: 'Za hodinkami se po jasné dráze vykreslují ozvěny jejich minulých poloh, které postupně mizí.',
  },
  '10': {
    id: '10', title: 'Fragmentace',
    description: 'Čas a vzpomínky si často nepamatuji jako souvislý celek, ale jako jednotlivé útržky, které mi teprve s odstupem začnou dávat smysl.',
    animationNote: 'Hodinky se rozkládají na samostatné části, které vizuálně vyjadřují tuto roztříštěnost.',
  },
  '11': {
    id: '11', title: 'Budoucnost',
    description: 'Z jediného přítomného okamžiku může vzniknout několik různých výsledků. Někdy odhadnu cílovou destinaci, samotný průběh však zůstává nepředvídatelný.',
    animationNote: 'Hodinky se dělí do více odlišných verzí, z nichž každá směřuje k cíli po své vlastní ose.',
  },
  '12': {
    id: '12', title: 'Relativita',
    description: 'Čas pro mne plyne pokaždé jinak. Vnímám samotný čas jako nezastavitelný fyzický proces, který mi protéká mezi prsty, nad pomyšlením kontroly cítím bezmoc.',
    animationNote: 'Jedna část hodinek spěchá, druhá váhá a třetí zůstává nehybně stát v prostoru.',
  },
} as const
