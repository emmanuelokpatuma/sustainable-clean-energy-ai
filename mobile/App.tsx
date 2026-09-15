import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

type TabKey = 'overview' | 'solar' | 'energy' | 'advisor' | 'plan';

type LocationData = {
  latitude: number;
  longitude: number;
  adminDistrict: string | null;
  region: string | null;
  postcodeOutward: string;
};

type SolarData = {
  annualGenerationKwh: number;
  annualIrradiationKwhPerM2: number;
  limitations?: string[];
  assumptions?: {
    peakPowerKw?: number;
    lossPercent?: number;
  };
};

type EnergyData = {
  current: {
    forecast: number;
    actual: number | null;
    index: string;
  };
  forecast?: {
    available: boolean;
    periods?: Array<{ forecast: number; index?: string; from: string; to: string }>;
  };
  interpretation?: {
    currentSummary: string;
    flexibleUseSuggestion?: {
      available: boolean;
      message?: string;
    };
  };
};

type GreenScoreData = {
  totalScore: number;
  strengths?: string[];
  opportunities?: string[];
};

type ActionPlanItem = {
  id: string;
  title: string;
  explanation: string;
  impactCategory: string;
  difficulty: string;
  confidence: string;
  priority: number;
  suggestedNextStep?: string;
};

type AnalysisState = {
  location?: LocationData;
  solar?: SolarData;
  energy?: EnergyData;
  green?: GreenScoreData;
  advisorAnswer?: string;
  actionPlan?: ActionPlanItem[];
  actionPlanNotes?: string[];
};

const API_BASE = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.message ?? 'Something went wrong.');
  }

  return data as T;
}

export default function App() {
  const [postcode, setPostcode] = useState('HG3 2UY');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>({});
  const [question, setQuestion] = useState('What\'s the best time to charge my EV today?');
  const [asking, setAsking] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(0);

  const onboardingSteps = [
    {
      title: 'Welcome to CleanTech',
      subtitle: 'Home Energy Insights',
      body: 'Track your GreenScore, solar potential, and grid carbon intensity in one beautiful snapshot.',
      emoji: '⚡',
      color: '#10b981',
    },
    {
      title: 'Smart Timing',
      subtitle: 'Lower Your Carbon Footprint',
      body: 'Know exactly when to shift EV charging and flexible loads to lower-carbon periods.',
      emoji: '🌍',
      color: '#06b6d4',
    },
    {
      title: 'AI Guidance',
      subtitle: 'Grounded in Real Data',
      body: 'Ask tailored questions grounded in your home\'s real solar and energy performance.',
      emoji: '🤖',
      color: '#f59e0b',
    },
  ];

  const summaryCards = useMemo(
    () => [
      {
        label: 'GreenScore',
        value: analysis.green ? `${analysis.green.totalScore}` : '--',
        subtext: 'Sustainability',
        accent: '#10b981',
        emoji: '🌱',
      },
      {
        label: 'Solar',
        value: analysis.solar ? `${Math.round(analysis.solar.annualGenerationKwh)}` : '--',
        subtext: 'kWh/year',
        accent: '#f59e0b',
        emoji: '☀️',
      },
      {
        label: 'Grid',
        value: analysis.energy ? analysis.energy.current.index.toUpperCase() : '--',
        subtext: 'Carbon',
        accent: '#06b6d4',
        emoji: '🔌',
      },
    ],
    [analysis],
  );

  const solarBars = [42, 58, 65, 72, 80, 86, 75, 68, 62, 52, 45, 38];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setAnalysis({});

    try {
      const locationResponse = await apiFetch<{ ok: true; location: LocationData }>('/api/location/resolve', {
        method: 'POST',
        body: JSON.stringify({ postcode }),
      });

      const location = locationResponse.location;

      const solarResponse = await apiFetch<{ ok: true; solarAssessment: SolarData }>('/api/solar/assess', {
        method: 'POST',
        body: JSON.stringify({ latitude: location.latitude, longitude: location.longitude }),
      });

      const energyResponse = await apiFetch<{ ok: true; energyNow: EnergyData; interpretation: any }>('/api/energy/current');

      const greenResponse = await apiFetch<{ ok: true; greenScore: GreenScoreData }>('/api/scores/green', {
        method: 'POST',
        body: JSON.stringify({
          solarAssessment: {
            annualIrradiationKwhPerM2: solarResponse.solarAssessment.annualIrradiationKwhPerM2,
          },
          carbonIntensity: {
            currentIndex: energyResponse.energyNow.current.index,
            forecastValues: energyResponse.energyNow.forecast?.periods?.map((period: any) => period.forecast),
          },
        }),
      });

      const actionPlanResponse = await apiFetch<{
        ok: true;
        actionPlan: { actions: ActionPlanItem[]; notes: string[] };
      }>('/api/action-plan/generate', {
        method: 'POST',
        body: JSON.stringify({
          greenScore: greenResponse.greenScore,
          solarScore: {
            annualGenerationKwh: solarResponse.solarAssessment.annualGenerationKwh,
            annualIrradiationKwhPerM2: solarResponse.solarAssessment.annualIrradiationKwhPerM2,
          },
          energyNow: energyResponse.energyNow,
        }),
      });

      setAnalysis({
        location,
        solar: solarResponse.solarAssessment,
        energy: energyResponse.energyNow,
        green: greenResponse.greenScore,
        actionPlan: actionPlanResponse.actionPlan.actions,
        actionPlanNotes: actionPlanResponse.actionPlan.notes,
      });
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Could not analyse this postcode.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const askAdvisor = async () => {
    if (!analysis.location) return;

    setAsking(true);
    setError(null);

    try {
      const response = await apiFetch<{ ok: true; answer: string }>('/api/advisor/ask', {
        method: 'POST',
        body: JSON.stringify({
          question,
          groundingContext: {
            location: {
              postcodeOutward: analysis.location.postcodeOutward,
              region: analysis.location.region,
              adminDistrict: analysis.location.adminDistrict,
            },
            greenScore: analysis.green ?? null,
            solarScore: analysis.solar
              ? {
                  annualGenerationKwh: analysis.solar.annualGenerationKwh,
                  annualIrradiationKwhPerM2: analysis.solar.annualIrradiationKwhPerM2,
                }
              : null,
            energyNow: analysis.energy ?? null,
          },
          conversationHistory: [],
        }),
      });

      setAnalysis((current) => ({ ...current, advisorAnswer: response.answer }));
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Could not ask the advisor.';
      setError(message);
    } finally {
      setAsking(false);
    }
  };

  const renderOnboarding = () => (
    <View style={styles.onboardingContainer}>
      <View style={styles.onboardingLogoWrap}>
        <View style={[styles.onboardingEmojiBg, { backgroundColor: onboardingSteps[onboardingStep].color }]}>
          <Text style={styles.onboardingEmoji}>{onboardingSteps[onboardingStep].emoji}</Text>
        </View>
        <Text style={styles.onboardingLogoText}>CleanTech Advisor</Text>
      </View>

      <View style={styles.onboardingCardWrap}>
        <Text style={styles.onboardingCounter}>
          {onboardingStep + 1}/{onboardingSteps.length}
        </Text>
        <Text style={styles.onboardingHeading}>{onboardingSteps[onboardingStep].title}</Text>
        <Text style={styles.onboardingSubheading}>{onboardingSteps[onboardingStep].subtitle}</Text>
        <Text style={styles.onboardingBody}>{onboardingSteps[onboardingStep].body}</Text>

        <View style={styles.onboardingDots}>
          {onboardingSteps.map((_, i) => (
            <View
              key={i}
              style={[
                styles.onboardingDot,
                onboardingStep === i && styles.onboardingDotActive,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.onboardingPrimaryBtn, { backgroundColor: onboardingSteps[onboardingStep].color }]}
          onPress={() => {
            if (onboardingStep === onboardingSteps.length - 1) {
              setShowOnboarding(false);
            } else {
              setOnboardingStep((s) => s + 1);
            }
          }}
        >
          <Text style={styles.onboardingPrimaryBtnText}>
            {onboardingStep === onboardingSteps.length - 1 ? '✨ Get Started' : 'Continue'}
          </Text>
        </TouchableOpacity>

        {onboardingStep > 0 && (
          <TouchableOpacity
            style={styles.onboardingSecondaryBtn}
            onPress={() => setOnboardingStep((s) => Math.max(0, s - 1))}
          >
            <Text style={styles.onboardingSecondaryBtnText}>← Back</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderOverview = () => (
    <>
      <View style={styles.heroGradient}>
        <Text style={styles.heroLabel}>Welcome Home</Text>
        <Text style={styles.heroTitle}>Your Energy Dashboard</Text>
        <Text style={styles.heroCaption}>Real-time UK data • Personalized insights</Text>
      </View>

      <View style={styles.searchBox}>
        <View style={styles.searchInputWrap}>
          <TextInput
            value={postcode}
            onChangeText={setPostcode}
            autoCapitalize="characters"
            style={styles.searchInput}
            placeholder="Enter UK postcode"
            placeholderTextColor="#64748b"
          />
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={analyze} disabled={loading}>
          <Text style={styles.searchBtnText}>{loading ? '…' : '→'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.metricsRow}>
        {summaryCards.map((card) => (
          <View key={card.label} style={[styles.metricCard, { borderColor: card.accent + '40' }]}>
            <Text style={styles.metricEmoji}>{card.emoji}</Text>
            <Text style={[styles.metricNumber, { color: card.accent }]}>{card.value}</Text>
            <Text style={styles.metricLabel}>{card.subtext}</Text>
          </View>
        ))}
      </View>

      {analysis.green && (
        <View style={styles.scoreCard}>
          <View style={[styles.scoreCircle, { borderColor: '#10b981' }]}>
            <Text style={styles.scoreNumber}>{analysis.green.totalScore}</Text>
            <Text style={styles.scoreLabel}>Score</Text>
          </View>
          <View style={styles.scoreTextWrap}>
            <Text style={styles.scoreTitle}>Your Home's Sustainability</Text>
            <Text style={styles.scoreDesc}>You're performing well with excellent solar potential.</Text>
            <Text style={styles.scoreHint}>💡 Track your progress in the Action Plan</Text>
          </View>
        </View>
      )}

      {analysis.solar && (
        <View style={styles.solarChartCard}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>☀️ Solar Generation</Text>
              <Text style={styles.cardValue}>{Math.round(analysis.solar.annualGenerationKwh)} kWh/year</Text>
            </View>
          </View>
          <View style={styles.solarChart}>
            {solarBars.map((height, idx) => (
              <View key={idx} style={styles.barGroup}>
                <View
                  style={[
                    styles.solarBar,
                    { height: `${height * 2}px`, backgroundColor: '#f59e0b' },
                  ]}
                />
                <Text style={styles.monthLabel}>{months[idx][0]}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {analysis.energy && (
        <View style={styles.energyCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>🔌 Grid Carbon Intensity</Text>
          </View>
          <View style={styles.gridStatus}>
            <Text style={getGridBadgeStyle(analysis.energy.current.index)}>
              {analysis.energy.current.index.toUpperCase()}
            </Text>
            <Text style={styles.gridText}>{analysis.energy.interpretation?.currentSummary}</Text>
          </View>
        </View>
      )}

      {analysis.location && (
        <View style={styles.locationCard}>
          <Text style={styles.cardTitle}>📍 Your Location</Text>
          <Text style={styles.locationValue}>{analysis.location.postcodeOutward}</Text>
          <Text style={styles.locationRegion}>{analysis.location.region}</Text>
        </View>
      )}
    </>
  );

  const renderSolar = () => (
    <>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>☀️ Solar Potential</Text>
      </View>
      {analysis.solar ? (
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Annual Generation</Text>
            <Text style={styles.detailValue}>{Math.round(analysis.solar.annualGenerationKwh)} kWh</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Annual Irradiation</Text>
            <Text style={styles.detailValue}>{Math.round(analysis.solar.annualIrradiationKwhPerM2)} kWh/m²</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>System Size</Text>
            <Text style={styles.detailValue}>{analysis.solar.assumptions?.peakPowerKw ?? '3.5'} kW</Text>
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.empytText}>📍 Enter a postcode to see your solar potential</Text>
        </View>
      )}
    </>
  );

  const getGridBadgeStyle = (index: string) => {
    switch (index) {
      case 'low':
        return styles.gridBadgelow;
      case 'moderate':
        return styles.gridBadgemoderate;
      case 'high':
        return styles.gridBadgehigh;
      default:
        return styles.gridBadgelow;
    }
  };

  const getCarboColorStyle = (index: string) => {
    switch (index) {
      case 'low':
        return styles.carbonlow;
      case 'moderate':
        return styles.carbonmoderate;
      case 'high':
        return styles.carbonhigh;
      default:
        return styles.carbonlow;
    }
  };

  const renderEnergy = () => (
    <>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>🔌 Grid Status</Text>
      </View>
      {analysis.energy ? (
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Carbon Intensity</Text>
            <Text style={[styles.detailValue, getCarboColorStyle(analysis.energy.current.index)]}>
              {analysis.energy.current.index.toUpperCase()}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailDesc}>{analysis.energy.interpretation?.currentSummary}</View>
          {analysis.energy.interpretation?.flexibleUseSuggestion?.message && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailDesc}>💡 {analysis.energy.interpretation.flexibleUseSuggestion.message}</View>
            </>
          )}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.empytText}>⚡ Live grid carbon data coming soon</Text>
        </View>
      )}
    </>
  );

  const renderAdvisor = () => (
    <>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>🤖 AI Advisor</Text>
      </View>
      {!analysis.location ? (
        <View style={styles.emptyCard}>
          <Text style={styles.empytText}>📍 Enter a postcode first to unlock AI recommendations</Text>
        </View>
      ) : (
        <View style={styles.detailsCard}>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            style={styles.advisorInput}
            placeholder="Ask your energy question…"
            placeholderTextColor="#64748b"
            multiline
          />
          <TouchableOpacity style={styles.askBtn} onPress={askAdvisor} disabled={asking}>
            <Text style={styles.askBtnText}>{asking ? '💭 Thinking…' : '✨ Ask Advisor'}</Text>
          </TouchableOpacity>
          {analysis.advisorAnswer && (
            <View style={styles.answerBox}>
              <Text style={styles.answerText}>{analysis.advisorAnswer}</Text>
            </View>
          )}
        </View>
      )}
    </>
  );

  const renderPlan = () => (
    <>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>📋 Action Plan</Text>
      </View>
      {analysis.actionPlan && analysis.actionPlan.length > 0 ? (
        analysis.actionPlan.map((item) => (
          <View key={item.id} style={styles.actionItem}>
            <View style={styles.actionHeader}>
              <Text style={styles.actionTitle}>{item.title}</Text>
              <View style={styles.actionTags}>
                <Text style={styles.actionTag}>{item.difficulty}</Text>
                <Text style={styles.actionTag}>P{item.priority}</Text>
              </View>
            </View>
            <Text style={styles.actionDesc}>{item.explanation}</Text>
            {item.suggestedNextStep && (
              <Text style={styles.actionNext}>→ {item.suggestedNextStep}</Text>
            )}
          </View>
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.empytText}>🎯 No actions identified yet</Text>
        </View>
      )}
      {analysis.actionPlanNotes && analysis.actionPlanNotes.length > 0 && (
        <View style={styles.notesBox}>
          {analysis.actionPlanNotes.map((note, i) => (
            <Text key={i} style={styles.noteItem}>• {note}</Text>
          ))}
        </View>
      )}
    </>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'solar':
        return renderSolar();
      case 'energy':
        return renderEnergy();
      case 'advisor':
        return renderAdvisor();
      case 'plan':
        return renderPlan();
      default:
        return renderOverview();
    }
  };

  if (showOnboarding) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.onboardingScrollContent}>
          {renderOnboarding()}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorMsg}>⚠️ {error}</Text>
          </View>
        )}

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={styles.loadingMsg}>Analyzing your energy profile…</Text>
          </View>
        )}

        {renderContent()}
      </ScrollView>

      <View style={styles.tabBarContainer}>
        <View style={styles.tabBar}>
          {[
            { key: 'overview', label: 'Home', icon: '🏠' },
            { key: 'solar', label: 'Solar', icon: '☀️' },
            { key: 'energy', label: 'Energy', icon: '⚡' },
            { key: 'plan', label: 'Plan', icon: '📋' },
            { key: 'advisor', label: 'Ask', icon: '🤖' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tabItem,
                activeTab === tab.key && styles.tabItemActive,
              ]}
              onPress={() => setActiveTab(tab.key as TabKey)}
            >
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text
                style={[
                  styles.tabItemLabel,
                  activeTab === tab.key && styles.tabItemLabelActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0e27',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 120,
  },
  onboardingScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    minHeight: '100%',
    justifyContent: 'center',
  },
  onboardingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  onboardingLogoWrap: {
    alignItems: 'center',
    marginBottom: 40,
  },
  onboardingEmojiBg: {
    width: 120,
    height: 120,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  onboardingEmoji: {
    fontSize: 60,
  },
  onboardingLogoText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  onboardingCardWrap: {
    backgroundColor: '#0f1729',
    borderRadius: 28,
    padding: 28,
    width: '100%',
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  onboardingCounter: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 16,
  },
  onboardingHeading: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 8,
  },
  onboardingSubheading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
    marginBottom: 12,
  },
  onboardingBody: {
    fontSize: 15,
    color: '#cbd5e1',
    lineHeight: 22,
    marginBottom: 24,
  },
  onboardingDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 28,
  },
  onboardingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#334155',
  },
  onboardingDotActive: {
    width: 24,
    backgroundColor: '#10b981',
  },
  onboardingPrimaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  onboardingPrimaryBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
  onboardingSecondaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#334155',
  },
  onboardingSecondaryBtnText: {
    color: '#cbd5e1',
    fontWeight: '700',
    fontSize: 15,
  },
  heroGradient: {
    backgroundColor: '#1a3a52',
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2d5a7b',
  },
  heroLabel: {
    color: '#64b5f6',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 6,
  },
  heroCaption: {
    color: '#b0bec5',
    fontSize: 14,
    fontWeight: '500',
  },
  searchBox: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  searchInputWrap: {
    flex: 1,
  },
  searchInput: {
    backgroundColor: '#0f1729',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
  searchBtn: {
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnText: {
    color: '#ffffff',
    fontSize: 24,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#0f1729',
    borderRadius: 18,
    padding: 14,
    borderWidth: 2,
    alignItems: 'center',
  },
  metricEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  metricNumber: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
  },
  scoreCard: {
    backgroundColor: 'linear-gradient(135deg, #0f1729 0%, #1a3a52 100%)',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    flexDirection: 'row',
    gap: 16,
  },
  scoreCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#051330',
    borderWidth: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreNumber: {
    fontSize: 36,
    fontWeight: '900',
    color: '#10b981',
  },
  scoreLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  scoreTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  scoreTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 6,
  },
  scoreDesc: {
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: 18,
    marginBottom: 8,
  },
  scoreHint: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
  },
  solarChartCard: {
    backgroundColor: '#0f1729',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  cardHeader: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#f59e0b',
    marginTop: 4,
  },
  solarChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
    gap: 6,
  },
  barGroup: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
  },
  solarBar: {
    width: '100%',
    borderRadius: 8,
    minHeight: 8,
  },
  monthLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 6,
  },
  energyCard: {
    backgroundColor: '#0f1729',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  gridStatus: {
    marginTop: 12,
  },
  gridBadgelow: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
  gridBadgemoderate: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
  gridBadgehigh: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
  gridText: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 20,
  },
  locationCard: {
    backgroundColor: '#0f1729',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  locationValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    marginTop: 8,
  },
  locationRegion: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  screenHeader: {
    marginBottom: 18,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
  },
  detailsCard: {
    backgroundColor: '#0f1729',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
  },
  carbonlow: {
    color: '#10b981',
  },
  carbonmoderate: {
    color: '#f59e0b',
  },
  carbonhigh: {
    color: '#ef4444',
  },
  divider: {
    height: 1,
    backgroundColor: '#1e3a5f',
  },
  detailDesc: {
    paddingVertical: 12,
    fontSize: 14,
    color: '#cbd5e1',
    lineHeight: 20,
  },
  advisorInput: {
    backgroundColor: '#051330',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    padding: 14,
    color: '#ffffff',
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  askBtn: {
    backgroundColor: '#f59e0b',
    borderRadius: 14,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  askBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },
  answerBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#10b981',
    padding: 14,
    marginTop: 12,
  },
  answerText: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 20,
  },
  actionItem: {
    backgroundColor: '#0f1729',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  actionHeader: {
    marginBottom: 10,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
  },
  actionTags: {
    flexDirection: 'row',
    gap: 8,
  },
  actionTag: {
    backgroundColor: '#1e3a5f',
    color: '#64b5f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: '700',
  },
  actionDesc: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  actionNext: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '700',
  },
  notesBox: {
    backgroundColor: '#0f1729',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  noteItem: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  emptyCard: {
    backgroundColor: '#0f1729',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  empytText: {
    color: '#94a3b8',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ef4444',
    padding: 12,
    marginBottom: 12,
  },
  errorMsg: {
    color: '#fca5a5',
    fontWeight: '600',
    fontSize: 14,
  },
  loadingBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#10b981',
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  loadingMsg: {
    color: '#a7f3d0',
    fontWeight: '600',
    marginTop: 10,
  },
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0a0e27',
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingBottom: 20,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0f1729',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    padding: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  tabItemActive: {
    backgroundColor: '#1e293b',
  },
  tabIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  tabItemLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  tabItemLabelActive: {
    color: '#10b981',
  },
});
