import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
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

type ApiResult<T> = { ok: boolean; message?: string; [key: string]: any } & T;

type LocationData = {
  latitude: number;
  longitude: number;
  adminDistrict: string | null;
  region: string | null;
  postcodeOutward: string;
  source?: string;
};

type SolarData = {
  annualGenerationKwh: number;
  annualIrradiationKwhPerM2: number;
  assumptions?: {
    peakPowerKw?: number;
    lossPercent?: number;
  };
  limitations?: string[];
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
  componentScores?: Array<{ key: string; label: string; score: number | null; included: boolean }>;
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
    if (!analysis.location) {
      return;
    }

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.kicker}>CleanTech Advisor</Text>
          <Text style={styles.title}>Sustainability at a glance</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>UK postcode</Text>
          <TextInput
            value={postcode}
            onChangeText={setPostcode}
            autoCapitalize="characters"
            style={styles.input}
            placeholder="e.g. SW1A 1AA"
          />
          <TouchableOpacity style={styles.primaryButton} onPress={analyze} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? 'Checking…' : 'Analyse my home'}</Text>
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#22c55e" />
            <Text style={styles.loadingText}>Resolving postcode and collecting your sustainability data…</Text>
          </View>
        ) : null}

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
            <Text style={styles.bodyText}>Your home sustainability and clean-tech readiness score.</Text>
            <Text style={styles.metaText}>
              {analysis.green.strengths?.[0] ?? 'No strengths reported yet.'}
            </Text>
          </View>
        ) : null}

        {analysis.solar ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Solar</Text>
            <Text style={styles.bodyText}>
              Annual generation: {analysis.solar.annualGenerationKwh.toFixed(0)} kWh
            </Text>
            <Text style={styles.bodyText}>
              Annual irradiation: {analysis.solar.annualIrradiationKwhPerM2.toFixed(0)} kWh/m²
            </Text>
          </View>
        ) : null}

        {analysis.energy ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Energy now</Text>
            <Text style={styles.bodyText}>
              Current grid intensity index: {analysis.energy.current.index}
            </Text>
            <Text style={styles.bodyText}>
              {analysis.energy.interpretation?.currentSummary ?? 'Carbon intensity summary unavailable.'}
            </Text>
          </View>
        ) : null}

        {analysis.location ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>AI advisor</Text>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              style={styles.input}
              placeholder="Ask about the best energy actions to take"
              multiline
            />
            <TouchableOpacity style={styles.secondaryButton} onPress={askAdvisor} disabled={asking}>
              <Text style={styles.secondaryButtonText}>{asking ? 'Thinking…' : 'Ask advisor'}</Text>
            </TouchableOpacity>
            {analysis.advisorAnswer ? (
              <Text style={styles.answerText}>{analysis.advisorAnswer}</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07111f',
  },
  container: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 16,
  },
  kicker: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
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
  label: {
    color: '#cbd5e1',
    fontSize: 12,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1220',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#04130d',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#eff6ff',
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  scoreValue: {
    color: '#86efac',
    fontSize: 38,
    fontWeight: '800',
    marginBottom: 8,
  },
  bodyText: {
    color: '#dfeaf5',
    fontSize: 14,
    marginBottom: 6,
  },
  metaText: {
    color: '#93c5fd',
    fontSize: 13,
    marginTop: 8,
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
  loadingBox: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingText: {
    color: '#cbd5e1',
    marginTop: 12,
    textAlign: 'center',
  },
  answerText: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
});
