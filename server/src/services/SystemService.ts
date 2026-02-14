import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class SystemService {
  /**
   * List all available timezones on the system
   */
  async getTimezones(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('timedatectl list-timezones');
      return stdout
        .split('\n')
        .map((tz) => tz.trim())
        .filter((tz) => tz.length > 0);
    } catch (error) {
      console.error('[SYSTEM] Failed to list timezones:', error);
      // Fallback to common timezones if timedatectl fails
      return [
        'UTC',
        'Africa/Abidjan',
        'Africa/Accra',
        'Africa/Algiers',
        'Africa/Bissau',
        'Africa/Cairo',
        'Africa/Casablanca',
        'Africa/Ceuta',
        'Africa/El_Aaiun',
        'Africa/Johannesburg',
        'Africa/Juba',
        'Africa/Khartoum',
        'Africa/Lagos',
        'Africa/Maputo',
        'Africa/Monrovia',
        'Africa/Nairobi',
        'Africa/Ndjamena',
        'Africa/Sao_Tome',
        'Africa/Tripoli',
        'Africa/Tunis',
        'Africa/Windhoek',
        'America/Adak',
        'America/Anchorage',
        'America/Araguaina',
        'America/Argentina/Buenos_Aires',
        'America/Argentina/Catamarca',
        'America/Argentina/Cordoba',
        'America/Argentina/Jujuy',
        'America/Argentina/La_Rioja',
        'America/Argentina/Mendoza',
        'America/Argentina/Rio_Gallegos',
        'America/Argentina/Salta',
        'America/Argentina/San_Juan',
        'America/Argentina/San_Luis',
        'America/Argentina/Tucuman',
        'America/Argentina/Ushuaia',
        'America/Asuncion',
        'America/Atikokan',
        'America/Bahia',
        'America/Bahia_Banderas',
        'America/Barbados',
        'America/Belem',
        'America/Belize',
        'America/Blanc-Sablon',
        'America/Boa_Vista',
        'America/Bogota',
        'America/Boise',
        'America/Cambridge_Bay',
        'America/Campo_Grande',
        'America/Cancun',
        'America/Caracas',
        'America/Cayenne',
        'America/Chicago',
        'America/Chihuahua',
        'America/Costa_Rica',
        'America/Creston',
        'America/Cuiaba',
        'America/Curacao',
        'America/Danmarkshavn',
        'America/Dawson',
        'America/Dawson_Creek',
        'America/Denver',
        'America/Detroit',
        'America/Edmonton',
        'America/Eirunepe',
        'America/El_Salvador',
        'America/Fort_Nelson',
        'America/Fortaleza',
        'America/Glace_Bay',
        'America/Goose_Bay',
        'America/Grand_Turk',
        'America/Guatemala',
        'America/Guayaquil',
        'America/Guyana',
        'America/Halifax',
        'America/Havana',
        'America/Hermosillo',
        'America/Indiana/Indianapolis',
        'America/Indiana/Knox',
        'America/Indiana/Marengo',
        'America/Indiana/Petersburg',
        'America/Indiana/Tell_City',
        'America/Indiana/Vevay',
        'America/Indiana/Vincennes',
        'America/Indiana/Winamac',
        'America/Inuvik',
        'America/Iqaluit',
        'America/Jamaica',
        'America/Juneau',
        'America/Kentucky/Louisville',
        'America/Kentucky/Monticello',
        'America/La_Paz',
        'America/Lima',
        'America/Los_Angeles',
        'America/Maceio',
        'America/Managua',
        'America/Manaus',
        'America/Martinique',
        'America/Matamoros',
        'America/Mazatlan',
        'America/Menominee',
        'America/Merida',
        'America/Metlakatla',
        'America/Mexico_City',
        'America/Miquelon',
        'America/Moncton',
        'America/Monterrey',
        'America/Montevideo',
        'America/Nassau',
        'America/New_York',
        'America/Nipigon',
        'America/Nome',
        'America/Noronha',
        'America/North_Dakota/Beulah',
        'America/North_Dakota/Center',
        'America/North_Dakota/New_Salem',
        'America/Nuuk',
        'America/Ojinaga',
        'America/Panama',
        'America/Pangnirtung',
        'America/Paramaribo',
        'America/Phoenix',
        'America/Port-au-Prince',
        'America/Port_of_Spain',
        'America/Porto_Velho',
        'America/Puerto_Rico',
        'America/Punta_Arenas',
        'America/Rainy_River',
        'America/Rankin_Inlet',
        'America/Recife',
        'America/Regina',
        'America/Resolute',
        'America/Rio_Branco',
        'America/Santarem',
        'America/Santiago',
        'America/Santo_Domingo',
        'America/Sao_Paulo',
        'America/Scoresbysund',
        'America/Sitka',
        'America/St_Johns',
        'America/Swift_Current',
        'America/Tegucigalpa',
        'America/Thule',
        'America/Thunder_Bay',
        'America/Tijuana',
        'America/Toronto',
        'America/Vancouver',
        'America/Whitehorse',
        'America/Winnipeg',
        'America/Yakutat',
        'America/Yellowknife',
        'Antarctica/Casey',
        'Antarctica/Davis',
        'Antarctica/DumontDUrville',
        'Antarctica/Macquarie',
        'Antarctica/Mawson',
        'Antarctica/Palmer',
        'Antarctica/Rothera',
        'Antarctica/Syowa',
        'Antarctica/Troll',
        'Antarctica/Vostok',
        'Asia/Almaty',
        'Asia/Amman',
        'Asia/Anadyr',
        'Asia/Aqtau',
        'Asia/Aqtobe',
        'Asia/Ashgabat',
        'Asia/Atyrau',
        'Asia/Baghdad',
        'Asia/Baku',
        'Asia/Bangkok',
        'Asia/Barnaul',
        'Asia/Beirut',
        'Asia/Bishkek',
        'Asia/Brunei',
        'Asia/Chita',
        'Asia/Choibalsan',
        'Asia/Colombo',
        'Asia/Damascus',
        'Asia/Dhaka',
        'Asia/Dili',
        'Asia/Dubai',
        'Asia/Dushanbe',
        'Asia/Famagusta',
        'Asia/Gaza',
        'Asia/Hebron',
        'Asia/Ho_Chi_Minh',
        'Asia/Hong_Kong',
        'Asia/Hovd',
        'Asia/Irkutsk',
        'Asia/Jakarta',
        'Asia/Jayapura',
        'Asia/Jerusalem',
        'Asia/Kabul',
        'Asia/Kamchatka',
        'Asia/Karachi',
        'Asia/Kathmandu',
        'Asia/Khandyga',
        'Asia/Kolkata',
        'Asia/Krasnoyarsk',
        'Asia/Kuala_Lumpur',
        'Asia/Kuching',
        'Asia/Macau',
        'Asia/Magadan',
        'Asia/Makassar',
        'Asia/Manila',
        'Asia/Nicosia',
        'Asia/Novokuznetsk',
        'Asia/Novosibirsk',
        'Asia/Omsk',
        'Asia/Oral',
        'Asia/Pontianak',
        'Asia/Pyongyang',
        'Asia/Qatar',
        'Asia/Qostanay',
        'Asia/Qyzylorda',
        'Asia/Riyadh',
        'Asia/Sakhalin',
        'Asia/Samarkand',
        'Asia/Seoul',
        'Asia/Shanghai',
        'Asia/Singapore',
        'Asia/Srednekolymsk',
        'Asia/Taipei',
        'Asia/Tashkent',
        'Asia/Tbilisi',
        'Asia/Tehran',
        'Asia/Thimphu',
        'Asia/Tokyo',
        'Asia/Tomsk',
        'Asia/Ulaanbaatar',
        'Asia/Urumqi',
        'Asia/Ust-Nera',
        'Asia/Vladivostok',
        'Asia/Yakutsk',
        'Asia/Yangon',
        'Asia/Yekaterinburg',
        'Asia/Yerevan',
        'Atlantic/Azores',
        'Atlantic/Bermuda',
        'Atlantic/Canary',
        'Atlantic/Cape_Verde',
        'Atlantic/Faroe',
        'Atlantic/Madeira',
        'Atlantic/Reykjavik',
        'Atlantic/South_Georgia',
        'Atlantic/Stanley',
        'Australia/Adelaide',
        'Australia/Brisbane',
        'Australia/Broken_Hill',
        'Australia/Currie',
        'Australia/Darwin',
        'Australia/Eucla',
        'Australia/Hobart',
        'Australia/Lindeman',
        'Australia/Lord_Howe',
        'Australia/Melbourne',
        'Australia/Perth',
        'Australia/Sydney',
        'Europe/Amsterdam',
        'Europe/Andorra',
        'Europe/Astrakhan',
        'Europe/Athens',
        'Europe/Belgrade',
        'Europe/Berlin',
        'Europe/Brussels',
        'Europe/Bucharest',
        'Europe/Budapest',
        'Europe/Chisinau',
        'Europe/Copenhagen',
        'Europe/Dublin',
        'Europe/Gibraltar',
        'Europe/Helsinki',
        'Europe/Istanbul',
        'Europe/Kaliningrad',
        'Europe/Kiev',
        'Europe/Kirov',
        'Europe/Lisbon',
        'Europe/London',
        'Europe/Luxembourg',
        'Europe/Madrid',
        'Europe/Malta',
        'Europe/Minsk',
        'Europe/Monaco',
        'Europe/Moscow',
        'Europe/Oslo',
        'Europe/Paris',
        'Europe/Prague',
        'Europe/Riga',
        'Europe/Rome',
        'Europe/Samara',
        'Europe/Saratov',
        'Europe/Simferopol',
        'Europe/Sofia',
        'Europe/Stockholm',
        'Europe/Tallinn',
        'Europe/Tirane',
        'Europe/Ulyanovsk',
        'Europe/Uzhgorod',
        'Europe/Vienna',
        'Europe/Vilnius',
        'Europe/Volgograd',
        'Europe/Warsaw',
        'Europe/Zaporozhye',
        'Europe/Zurich',
        'Indian/Chagos',
        'Indian/Christmas',
        'Indian/Cocos',
        'Indian/Kerguelen',
        'Indian/Mahe',
        'Indian/Maldives',
        'Indian/Mauritius',
        'Indian/Reunion',
        'Pacific/Apia',
        'Pacific/Auckland',
        'Pacific/Bougainville',
        'Pacific/Chatham',
        'Pacific/Chuuk',
        'Pacific/Easter',
        'Pacific/Efate',
        'Pacific/Enderbury',
        'Pacific/Fakaofo',
        'Pacific/Fiji',
        'Pacific/Funafuti',
        'Pacific/Galapagos',
        'Pacific/Gambier',
        'Pacific/Guadalcanal',
        'Pacific/Guam',
        'Pacific/Honolulu',
        'Pacific/Kiritimati',
        'Pacific/Kosrae',
        'Pacific/Kwajalein',
        'Pacific/Majuro',
        'Pacific/Marquesas',
        'Pacific/Nauru',
        'Pacific/Niue',
        'Pacific/Norfolk',
        'Pacific/Noumea',
        'Pacific/Pago_Pago',
        'Pacific/Palau',
        'Pacific/Pitcairn',
        'Pacific/Pohnpei',
        'Pacific/Port_Moresby',
        'Pacific/Rarotonga',
        'Pacific/Tahiti',
        'Pacific/Tarawa',
        'Pacific/Tongatapu',
        'Pacific/Wake',
        'Pacific/Wallis',
      ];
    }
  }

  /**
   * Get current system timezone
   */
  async getCurrentTimezone(): Promise<string> {
    try {
      const { stdout } = await execAsync('timedatectl show --property=Timezone --value');
      return stdout.trim() || 'UTC';
    } catch (error) {
      console.error('[SYSTEM] Failed to get current timezone:', error);
      return 'UTC';
    }
  }

  /**
   * Set system timezone
   */
  async setTimezone(timezone: string): Promise<{ success: boolean; message: string }> {
    try {
      // 1. Check if platform is Linux
      if (process.platform !== 'linux') {
        console.warn(
          `[SYSTEM] Timezone change skipped: Platform is ${process.platform} (Only Linux supported)`
        );
        return {
          success: true,
          message: `Dev Mode: Timezone would be changed to ${timezone} on Linux.`,
        };
      }

      // 2. Input validation
      if (!/^[a-zA-Z0-9/_+-]+$/.test(timezone)) {
        throw new Error('Invalid timezone format');
      }

      // 3. Execution
      try {
        await execAsync(`sudo timedatectl set-timezone ${timezone}`);
        console.log(`[SYSTEM] Timezone changed to: ${timezone}`);
        return { success: true, message: `Timezone updated to ${timezone}` };
      } catch (execError: unknown) {
        const message = execError instanceof Error ? execError.message : String(execError);
        if (message.includes('sudo: a password is required')) {
          throw new Error(
            'Sudo password required. Please configure passwordless sudo for timedatectl.'
          );
        }
        throw execError;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[SYSTEM] Failed to set timezone:', error);
      const isSudoError = message.includes('password required');
      return {
        success: false,
        message: isSudoError
          ? 'Permission denied: Sudo requires a password. Please check sudoers configuration.'
          : message || 'Failed to update system timezone. Ensure panel has sudo permissions.',
      };
    }
  }

  /**
   * Get server time and timezone
   */
  async getSystemStatus(): Promise<{ timezone: string; time: string }> {
    const timezone = await this.getCurrentTimezone();
    return {
      timezone,
      time: new Date().toISOString(),
    };
  }
}

export const systemService = new SystemService();
