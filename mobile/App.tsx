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
} from 'react-native';

type TabKey = 'overview' | 'solar' | 'energy' | 'advisor';

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

type AnalysisState = {
  location?: LocationData;
  solar?: SolarData;
  energy?: EnergyData;
  green?: GreenScoreData;
  advisorAnswer?: string;
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
  const [postcode, setPostcode] = useState('SW1A 1AA');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>({});
  const [question, setQuestion] = useState('Should I charge my EV later today?');
  const [asking, setAsking] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const summaryCards = useMemo(
    () => [
      {
        label: 'GreenScore',
        value: analysis.green ? `${analysis.green.totalScore}/100` : '--',
        accent: '#34d399',
      },
      {
        label: 'Solar',
        value: analysis.solar ? `${Math.round(analysis.solar.annualGenerationKwh)} kWh` : '--',
        accent: '#60a5fa',
      },
      {
        label: 'Grid',
        value: analysis.energy ? analysis.energy.current.index : '--',
        accent: '#fbbf24',
      },
    ],
    [analysis],
  );

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

      setAnalysis({
        location,
        solar: solarResponse.solarAssessment,
        energy: energyResponse.energyNow,
        green: greenResponse.greenScore,
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

  const renderOverview = () => (
    <>
      <View style={styles.heroCard}>
        <Text style={styles.kicker}>CleanTech Advisor</Text>
        <Text style={styles.title}>Your home energy score</Text>
        <Text style={styles.subtitle}>Track solar, carbon intensity and sustainable actions in one place.</Text>

        <View style={styles.searchRow}>
          <TextInput
            value={postcode}
            onChangeText={setPostcode}
            autoCapitalize="characters"
            style={styles.input}
            placeholder="SW1A 1AA"
          />
          <TouchableOpacity style={styles.primaryButton} onPress={analyze} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? 'Checking…' : 'Go'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.summaryRow}>
        {summaryCards.map((card) => (
          <View key={card.label} style={[styles.metricCard, { borderColor: card.accent }]}>
            <Text style={styles.metricLabel}>{card.label}</Text>
            <Text style={[styles.metricValue, { color: card.accent }]}>{card.value}</Text>
          </View>
        ))}
      </View>

      {analysis.location ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Location</Text>
          <Text style={styles.bodyText}>
            {analysis.location.postcodeOutward} · {analysis.location.region ?? 'Unknown region'}
          </Text>
        </View>
      ) : null}

      {analysis.green ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>GreenScore</Text>
          <Text style={styles.scoreValue}>{analysis.green.totalScore}/100</Text>
          <Text style={styles.bodyText}>Your sustainability and clean-tech readiness score.</Text>
          {analysis.green.strengths && analysis.green.strengths.length > 0 ? (
            <Text style={styles.metaText}>• {analysis.green.strengths[0]}</Text>
          ) : null}
        </View>
      ) : null}
    </>
  );

  const renderSolar = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Solar potential</Text>
        {analysis.solar ? (
          <>
            <Text style={styles.bodyText}>Annual generation: {Math.round(analysis.solar.annualGenerationKwh)} kWh</Text>
            <Text style={styles.bodyText}>Irradiation: {Math.round(analysis.solar.annualIrradiationKwhPerM2)} kWh/m²</Text>
            <Text style={styles.metaText}>System assumptions: {analysis.solar.assumptions?.peakPowerKw ?? '3.5'} kW</Text>
          </>
        ) : (
          <Text style={styles.bodyText}>Enter a postcode to review solar potential for your home.</Text>
        )}
      </View>
    </>
  );

  const renderEnergy = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Energy now</Text>
        {analysis.energy ? (
          <>
            <Text style={styles.bodyText}>Current index: {analysis.energy.current.index}</Text>
            <Text style={styles.bodyText}>{analysis.energy.interpretation?.currentSummary ?? 'Carbon intensity summary unavailable.'}</Text>
            <Text style={styles.metaText}>Best flexible use window: {analysis.energy.interpretation?.flexibleUseSuggestion?.message ?? 'Not available'}</Text>
          </>
        ) : (
          <Text style={styles.bodyText}>Check your live grid carbon intensity and recommended flexible usage times.</Text>
        )}
      </View>
    </>
  );

  const renderAdvisor = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>AI advisor</Text>
        {!analysis.location ? (
          <Text style={styles.bodyText}>Analyse a postcode first to unlock tailored recommendations.</Text>
        ) : (
          <>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              style={styles.inputArea}
              multiline
              placeholder="Ask about the best energy actions for today"
            />
            <TouchableOpacity style={styles.secondaryButton} onPress={askAdvisor} disabled={asking}>
              <Text style={styles.secondaryButtonText}>{asking ? 'Thinking…' : 'Ask advisor'}</Text>
            </TouchableOpacity>
            {analysis.advisorAnswer ? <Text style={styles.answerText}>{analysis.advisorAnswer}</Text> : null}
          </>
        )}
      </View>
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
      default:
        return renderOverview();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#4ade80" />
            <Text style={styles.loadingText}>Resolving postcode and pulling together your energy profile…</Text>
          </View>
        ) : null}

        {renderContent()}
      </ScrollView>

      <View style={styles.tabBar}>
        {[
          { key: 'overview', label: 'Home' },
          { key: 'solar', label: 'Solar' },
          { key: 'energy', label: 'Energy' },
          { key: 'advisor', label: 'Advisor' },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key as TabKey)}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#06121d',
  },
  container: {
    padding: 18,
    paddingBottom: 120,
  },
  heroCard: {
    backgroundColor: '#0b1727',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1d3557',
    padding: 20,
    marginBottom: 18,
  },
  kicker: {
    color: '#86efac',
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  title: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 8,
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  searchRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#0f1d2e',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
    fontSize: 15,
  },
  inputArea: {
    backgroundColor: '#0f1d2e',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
    minHeight: 96,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#06210d',
    fontWeight: '800',
    fontSize: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  metricLabel: {
    color: '#a8b3c7',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 8,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  bodyText: {
    color: '#dfeaf5',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 5,
  },
  scoreValue: {
    color: '#34d399',
    fontSize: 38,
    fontWeight: '800',
    marginBottom: 8,
  },
  metaText: {
    color: '#93c5fd',
    fontSize: 13,
    marginTop: 8,
  },
  secondaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#eff6ff',
    fontWeight: '700',
  },
  errorCard: {
    backgroundColor: '#7f1d1d',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  errorText: {
    color: '#fee2e2',
    fontWeight: '600',
  },
  loadingCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    alignItems: 'center',
  },
  loadingText: {
    color: '#dfeaf5',
    marginTop: 12,
    textAlign: 'center',
  },
  answerText: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  tabBar: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    right: 18,
    backgroundColor: '#0f172a',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1e293b',
    flexDirection: 'row',
    padding: 8,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
  },
  tabItemActive: {
    backgroundColor: '#1d4ed8',
  },
  tabLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: '#f8fafc',
  },
});
